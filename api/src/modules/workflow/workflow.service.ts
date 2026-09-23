import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AccessLevel,
  AuditAction,
  DatabaseService,
  SubjectType,
  TaskAction,
  TaskStatus,
  WorkflowStatus,
  newId,
} from '../../common/db';
import type { AuthUser } from '../../common/types/auth.types';
import { AuditService } from '../audit/audit.service';
import { AccessService } from '../access/access.service';

/**
 * A step in a definition's `steps` array.
 *
 * Held as jsonb rather than a table because a definition is edited as a whole —
 * reordering steps is one write, and a half-saved workflow is not a state worth
 * being able to represent.
 */
export interface StepSpec {
  key: string;
  name: string;
  /** Who does it. A role reaches whoever holds it today, not a fixed person. */
  assignee: { type: SubjectType; id: string };
  action?: TaskAction;
  /** Access granted for the duration of the task, and taken back after (WFL-4). */
  grant?: AccessLevel;
  dueInDays?: number;
  /** Where an overdue step goes. Named, not broadcast (WFL-6). */
  escalateTo?: { type: SubjectType; id: string } | null;
}

/** What makes a workflow start (WFL-1, WFL-2). */
export interface TriggerSpec {
  /** Filed into this folder, or anywhere beneath it. */
  folderId?: string | null;
  /** Of this document type. */
  documentTypeId?: string | null;
  /** And matching every one of these index-field conditions. */
  where?: Array<{ fieldId: string; op: 'eq' | 'gt' | 'lt'; value: string | number }>;
}

/**
 * The workflow engine.
 *
 * The tables have existed since the baseline and nothing drove them. This is
 * what drives them: a document filed into a folder starts whatever matches,
 * tasks are raised for the first step, deciding one advances the instance, and
 * an overdue step escalates to a named alternative rather than to everybody.
 *
 * Two things here are load-bearing beyond the obvious.
 *
 * A step assigned to a role reaches whoever holds that role at the moment the
 * task is raised. Resolving to a person when the workflow was written produces
 * approvals sitting with someone who left last year.
 *
 * A task can carry access for its own duration (WFL-4). An approver who cannot
 * open what they are approving will either be given a standing grant nobody
 * remembers to remove, or will approve it unread.
 */
@Injectable()
export class WorkflowService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
  ) {}

  /* -- Starting --------------------------------------------------------------- */

  /**
   * Starts every definition whose trigger matches this document.
   *
   * Called when a document is filed. Never throws into the caller's path: a
   * workflow that fails to start must not also fail the upload that would have
   * started it.
   */
  async onDocumentFiled(user: AuthUser, documentId: string): Promise<string[]> {
    const started: string[] = [];

    try {
      const doc = await this.db.maybeOne<{
        id: string;
        name: string;
        folderId: string | null;
        documentTypeId: string | null;
        folderPath: string | null;
      }>(
        `SELECT d.id, d.name, d."folderId", d."documentTypeId", f.path AS "folderPath"
           FROM documents d
           LEFT JOIN folders f ON f.id = d."folderId"
          WHERE d.id = $1 AND d."organizationId" = $2 AND d."deletedAt" IS NULL`,
        [documentId, user.organizationId],
      );
      if (!doc) return started;

      const definitions = await this.db.query<{
        id: string;
        name: string;
        steps: StepSpec[];
        trigger: TriggerSpec | null;
      }>(
        `SELECT id, name, steps, trigger FROM workflow_definitions
          WHERE "organizationId" = $1 AND "isActive" = true`,
        [user.organizationId],
      );

      for (const def of definitions) {
        if (!def.steps?.length) continue;
        if (!(await this.matches(def.trigger, doc))) continue;

        // One live instance of a definition per document. Filing a correction
        // should not raise a second approval for the same thing.
        const existing = await this.db.maybeOne<{ id: string }>(
          `SELECT id FROM workflow_instances
            WHERE "definitionId" = $1 AND "documentId" = $2 AND status = 'ACTIVE'`,
          [def.id, doc.id],
        );
        if (existing) continue;

        started.push(await this.startInstance(user, def, doc.id, doc.name));
      }
    } catch {
      // Deliberately swallowed. See the docstring: the upload matters more.
    }

    return started;
  }

  /** Whether a trigger describes this document. */
  private async matches(
    trigger: TriggerSpec | null,
    doc: { folderId: string | null; documentTypeId: string | null; folderPath: string | null },
  ): Promise<boolean> {
    // No trigger means the definition is started by hand, not by filing.
    if (!trigger) return false;

    if (trigger.documentTypeId && trigger.documentTypeId !== doc.documentTypeId) return false;

    if (trigger.folderId) {
      // "Or any folder beneath it" — the path is materialised, so a subtree
      // test is a prefix match rather than a recursive walk.
      const folder = await this.db.maybeOne<{ path: string }>(
        'SELECT path FROM folders WHERE id = $1',
        [trigger.folderId],
      );
      if (!folder || !doc.folderPath?.startsWith(folder.path)) return false;
    }

    for (const cond of trigger.where ?? []) {
      const value = await this.db.maybeOne<{
        valueText: string | null;
        valueNumber: string | null;
        valueDate: Date | null;
      }>(
        `SELECT "valueText", "valueNumber", "valueDate"
           FROM document_field_values
          WHERE "documentId" = $1 AND "fieldId" = $2`,
        [(doc as { id?: string }).id ?? '', cond.fieldId],
      );
      if (!value) return false;

      const actual = value.valueNumber !== null ? Number(value.valueNumber) : value.valueText;
      if (actual === null || actual === undefined) return false;

      if (cond.op === 'eq' && String(actual) !== String(cond.value)) return false;
      if (cond.op === 'gt' && !(Number(actual) > Number(cond.value))) return false;
      if (cond.op === 'lt' && !(Number(actual) < Number(cond.value))) return false;
    }

    return true;
  }

  /** Creates the instance and raises the first step's tasks. */
  private async startInstance(
    user: AuthUser,
    def: { id: string; name: string; steps: StepSpec[] },
    documentId: string,
    documentName: string,
  ) {
    const instanceId = newId();

    await this.db.transaction(async () => {
      await this.db.execute(
        `INSERT INTO workflow_instances (id, "definitionId", "documentId", status, "currentStep",
                                          "initiatorId", steps)
         VALUES ($1, $2, $3, 'ACTIVE', 0, $4, $5)`,
        [instanceId, def.id, documentId, user.id, JSON.stringify(def.steps)],
      );
      await this.raiseTasks(instanceId, def.steps, 0, documentId);
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.WORKFLOW_START,
      resourceType: 'Document',
      resourceId: documentId,
      resourceName: documentName,
      metadata: { event: 'workflow_started', workflow: def.name, instanceId },
    });

    return instanceId;
  }

  /**
   * Raises the tasks for one step.
   *
   * A role or group becomes one task per person holding it at this moment,
   * which is what makes "whoever is unit head today" work.
   */
  private async raiseTasks(
    instanceId: string,
    steps: StepSpec[],
    index: number,
    documentId: string,
  ) {
    const step = steps[index];
    if (!step) return;

    const due = step.dueInDays ? `now() + interval '${Number(step.dueInDays)} days'` : 'NULL';
    const holders = await this.resolveAssignees(step.assignee);

    // A task carries access to the record for its own duration, but that grant
    // fills silence rather than overruling a deny (WFL-4). Raising one against
    // somebody refused the record would put a row in their queue that they can
    // see and cannot open, which tells them a document exists, tells them
    // nothing about it, and cannot be acted on. They are not a candidate.
    const refused = await this.access.refusedBy(documentId, holders);
    const assignees = holders.filter((id) => !refused.has(id));

    for (const assigneeId of assignees) {
      await this.db.execute(
        `INSERT INTO workflow_tasks
           (id, "instanceId", "stepIndex", "stepKey", action, status, "assigneeType",
            "assigneeId", "grantedLevel", "dueAt")
         VALUES ($1, $2, $3, $4, $5, 'PENDING', 'USER', $6, $7, ${due})`,
        [
          newId(),
          instanceId,
          index,
          step.key,
          step.action ?? TaskAction.APPROVE,
          assigneeId,
          step.grant ?? AccessLevel.READ,
        ],
      );
    }

    // Nobody can do it. Left as an unassigned task rather than skipped:
    // silently advancing past an approval is the one outcome nobody wants.
    //
    // The reason is recorded because the two have different remedies. An empty
    // role needs somebody put in it; a refused one needs either the deny lifted
    // or the step reassigned. From the outside the two look identical.
    if (assignees.length === 0) {
      await this.db.execute(
        `INSERT INTO workflow_tasks
           (id, "instanceId", "stepIndex", "stepKey", action, status, "assigneeType",
            "assigneeGroupId", "grantedLevel", "dueAt", "blockedReason")
         VALUES ($1, $2, $3, $4, $5, 'PENDING', $6, $7, $8, ${due}, $9)`,
        [
          newId(),
          instanceId,
          index,
          step.key,
          step.action ?? TaskAction.APPROVE,
          step.assignee.type,
          step.assignee.id,
          step.grant ?? AccessLevel.READ,
          holders.length === 0 ? 'NO_ASSIGNEE' : 'REFUSED',
        ],
      );
    }
  }

  /** The people a step's assignee resolves to right now. */
  private async resolveAssignees(assignee: { type: SubjectType; id: string }): Promise<string[]> {
    if (assignee.type === SubjectType.USER) return [assignee.id];

    const sql =
      assignee.type === SubjectType.ROLE
        ? `SELECT ur."userId" AS id FROM user_roles ur
            JOIN users u ON u.id = ur."userId"
           WHERE ur."roleId" = $1 AND u."deletedAt" IS NULL AND u.status = 'ACTIVE'`
        : assignee.type === SubjectType.GROUP
          ? `SELECT gm."userId" AS id FROM group_members gm
              JOIN users u ON u.id = gm."userId"
             WHERE gm."groupId" = $1 AND u."deletedAt" IS NULL AND u.status = 'ACTIVE'`
          : `SELECT id FROM users
              WHERE "branchId" = $1 AND "deletedAt" IS NULL AND status = 'ACTIVE'`;

    const rows = await this.db.query<{ id: string }>(sql, [assignee.id]);
    return rows.map((r) => r.id);
  }

  /* -- Deciding --------------------------------------------------------------- */

  /**
   * Approves or rejects a task, and moves the instance on.
   *
   * A rejection stops the whole instance. Continuing past a refusal would make
   * the approval decorative, which is worse than not asking.
   */
  async decide(user: AuthUser, taskId: string, approve: boolean, comment?: string) {
    const task = await this.db.maybeOne<{
      id: string;
      instanceId: string;
      stepIndex: number;
      assigneeId: string | null;
      status: TaskStatus;
      documentId: string;
      documentName: string;
      organizationId: string;
      definitionId: string;
      steps: StepSpec[];
      workflowName: string;
    }>(
      `SELECT t.id, t."instanceId", t."stepIndex", t."assigneeId", t.status,
              i."documentId", d.name AS "documentName", d."organizationId",
              i."definitionId", i.steps, w.name AS "workflowName"
         FROM workflow_tasks t
         JOIN workflow_instances i ON i.id = t."instanceId"
         JOIN workflow_definitions w ON w.id = i."definitionId"
         JOIN documents d ON d.id = i."documentId"
        WHERE t.id = $1`,
      [taskId],
    );

    if (!task) throw new NotFoundException('No such task.');
    if (task.organizationId !== user.organizationId) {
      throw new ForbiddenException('That task belongs to another organisation.');
    }
    if (task.assigneeId && task.assigneeId !== user.id) {
      throw new ForbiddenException('That task is assigned to somebody else.');
    }
    if (task.status !== TaskStatus.PENDING && task.status !== TaskStatus.IN_PROGRESS) {
      throw new BadRequestException(`This task is already ${task.status.toLowerCase()}.`);
    }

    await this.db.transaction(async () => {
      await this.db.execute(
        `UPDATE workflow_tasks SET status = $1, comment = $2, "decidedAt" = now(),
                "assigneeId" = COALESCE("assigneeId", $3)
          WHERE id = $4`,
        [approve ? TaskStatus.COMPLETED : TaskStatus.REJECTED, comment ?? null, user.id, taskId],
      );

      if (!approve) {
        await this.db.execute(
          `UPDATE workflow_instances SET status = 'REJECTED', "completedAt" = now() WHERE id = $1`,
          [task.instanceId],
        );
        // Everything still outstanding on a stopped instance is moot.
        await this.db.execute(
          `UPDATE workflow_tasks SET status = 'SKIPPED'
            WHERE "instanceId" = $1 AND status IN ('PENDING', 'IN_PROGRESS')`,
          [task.instanceId],
        );
        return;
      }

      // One approval per step is enough; a step assigned to a role means "one
      // of these people", not "all of them".
      await this.db.execute(
        `UPDATE workflow_tasks SET status = 'SKIPPED'
          WHERE "instanceId" = $1 AND "stepIndex" = $2 AND status = 'PENDING' AND id <> $3`,
        [task.instanceId, task.stepIndex, taskId],
      );

      const next = task.stepIndex + 1;
      if (next < task.steps.length) {
        await this.db.execute(
          'UPDATE workflow_instances SET "currentStep" = $1 WHERE id = $2',
          [next, task.instanceId],
        );
        await this.raiseTasks(task.instanceId, task.steps, next, task.documentId);
      } else {
        await this.db.execute(
          `UPDATE workflow_instances SET status = 'COMPLETED', "completedAt" = now() WHERE id = $1`,
          [task.instanceId],
        );
      }
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.WORKFLOW_DECISION,
      resourceType: 'Document',
      resourceId: task.documentId,
      resourceName: task.documentName,
      metadata: {
        event: approve ? 'workflow_approved' : 'workflow_rejected',
        workflow: task.workflowName,
        step: task.stepIndex,
        comment: comment ?? null,
      },
    });

    return this.instance(user, task.instanceId);
  }

  /* -- Reading ---------------------------------------------------------------- */

  /** What is waiting for this person, oldest first (WFL-9). */
  async myTasks(user: AuthUser) {
    const items = await this.db.query(
      `SELECT t.id, t."stepKey", t.action, t.status, t."dueAt", t."createdAt",
              t."grantedLevel",
              i.id AS "instanceId", i."currentStep",
              d.id AS "documentId", d.name AS "documentName", d.classification,
              w.name AS "workflowName", i.steps,
              (t."dueAt" IS NOT NULL AND t."dueAt" < now()) AS overdue
         FROM workflow_tasks t
         JOIN workflow_instances i ON i.id = t."instanceId"
         JOIN workflow_definitions w ON w.id = i."definitionId"
         JOIN documents d ON d.id = i."documentId"
        WHERE d."organizationId" = $1
          AND i.status = 'ACTIVE'
          AND t.status IN ('PENDING', 'IN_PROGRESS')
          AND (
            t."assigneeId" = $2
            -- Unassigned tasks on a role or group this person belongs to.
            OR (t."assigneeId" IS NULL AND t."assigneeGroupId" IN (
                  SELECT "roleId" FROM user_roles WHERE "userId" = $2
                  UNION SELECT "groupId" FROM group_members WHERE "userId" = $2))
          )
        ORDER BY t."dueAt" ASC NULLS LAST, t."createdAt" ASC`,
      [user.organizationId, user.id],
    );

    // Assignment already skips anybody refused the record, but a deny written
    // after the task was raised would leave one here. Filtering on the way out
    // as well means the queue corrects itself rather than holding a row that
    // opens onto 403 until somebody notices.
    const blocked = new Set<string>();
    for (const documentId of new Set(items.map((t) => t.documentId as string))) {
      if ((await this.access.refusedBy(documentId, [user.id])).size) blocked.add(documentId);
    }
    const visible = items.filter((t) => !blocked.has(t.documentId as string));

    return {
      items: visible.map((t) => ({
        ...t,
        stepName:
          (t.steps as StepSpec[])?.[t.currentStep as number]?.name ?? (t.stepKey as string),
      })),
      total: visible.length,
      overdue: visible.filter((t) => t.overdue).length,
    };
  }

  /** One instance, with its whole history. */
  async instance(user: AuthUser, id: string) {
    const inst = await this.db.maybeOne<Record<string, unknown>>(
      `SELECT i.*, w.name AS "workflowName", d.name AS "documentName",
              d."organizationId"
         FROM workflow_instances i
         JOIN workflow_definitions w ON w.id = i."definitionId"
         JOIN documents d ON d.id = i."documentId"
        WHERE i.id = $1`,
      [id],
    );
    if (!inst) throw new NotFoundException('No such workflow instance.');
    if (inst.organizationId !== user.organizationId) {
      throw new ForbiddenException('That workflow belongs to another organisation.');
    }

    const tasks = await this.db.query(
      `SELECT t.*, u."displayName" AS "assigneeName"
         FROM workflow_tasks t
         LEFT JOIN users u ON u.id = t."assigneeId"
        WHERE t."instanceId" = $1
        ORDER BY t."stepIndex" ASC, t."createdAt" ASC`,
      [id],
    );

    return { ...inst, tasks };
  }

  /** The workflows a tenant has defined, and what each is doing right now. */
  async definitions(user: AuthUser) {
    const items = await this.db.query(
      `SELECT w.id, w.name, w.description, w."isActive", w.steps, w.trigger, w."createdAt",
              COALESCE(a.n, 0) AS "inFlight",
              COALESCE(o.n, 0) AS overdue,
              COALESCE(c.n, 0) AS completed,
              t.name AS "triggerTypeName",
              f.name AS "triggerFolderName"
         FROM workflow_definitions w
         LEFT JOIN document_types t ON t.id = (w.trigger->>'documentTypeId')
         LEFT JOIN folders f ON f.id = (w.trigger->>'folderId')
         LEFT JOIN LATERAL (SELECT count(*) AS n FROM workflow_instances
                             WHERE "definitionId" = w.id AND status = 'ACTIVE') a ON TRUE
         LEFT JOIN LATERAL (SELECT count(*) AS n FROM workflow_instances
                             WHERE "definitionId" = w.id AND status = 'COMPLETED') c ON TRUE
         LEFT JOIN LATERAL (
              SELECT count(*) AS n
                FROM workflow_tasks wt
                JOIN workflow_instances wi ON wi.id = wt."instanceId"
               WHERE wi."definitionId" = w.id
                 AND wi.status = 'ACTIVE'
                 AND wt.status = 'PENDING'
                 AND wt."dueAt" IS NOT NULL
                 AND wt."dueAt" < now()) o ON TRUE
        WHERE w."organizationId" = $1
        ORDER BY w."isActive" DESC, w.name ASC`,
      [user.organizationId],
    );

    return {
      items,
      total: items.length,
      live: items.filter((w) => w.isActive).length,
      inFlight: items.reduce((n, w) => n + Number(w.inFlight), 0),
    };
  }

  /** Everything a given workflow currently has running. */
  async inFlight(user: AuthUser, definitionId: string) {
    // Each row names a document. Scoped to what the caller can read, or the
    // screen becomes a list of every record moving through the organisation.
    const items = await this.db.query(
      // An instance whose current task has a blockedReason is waiting on nobody.
      // It is reported here because this is the only screen that looks at a
      // workflow as a whole — it will never appear in anybody's queue, which is
      // exactly the problem with it.
      `SELECT i.id, i.status, i."currentStep", i."startedAt",
              d.name AS "documentName", d.id AS "documentId",
              (SELECT count(*) FROM workflow_tasks
                WHERE "instanceId" = i.id AND status = 'PENDING') AS "openTasks",
              (SELECT t."blockedReason" FROM workflow_tasks t
                WHERE t."instanceId" = i.id AND t.status = 'PENDING'
                  AND t."blockedReason" IS NOT NULL
                LIMIT 1) AS "blockedReason"
         FROM workflow_instances i
         JOIN documents d ON d.id = i."documentId"
        WHERE i."definitionId" = $1 AND d."organizationId" = $2
          AND ($3::text[] IS NULL OR d."folderId" = ANY($3::text[]))
        ORDER BY i."startedAt" DESC
        LIMIT 100`,
      [definitionId, user.organizationId, await this.access.readableFolderIds(user)],
    );
    return { items, total: items.length };
  }

  /* -- Escalation ------------------------------------------------------------- */

  /**
   * Moves overdue tasks to their step's named alternative (WFL-6).
   *
   * To a named person, not to everybody: an escalation that pages a whole
   * department is one nobody owns. Returns what it touched so the caller can
   * log it rather than it happening silently.
   */
  async escalateOverdue(): Promise<number> {
    const overdue = await this.db.query<{
      id: string;
      instanceId: string;
      stepIndex: number;
      steps: StepSpec[];
      organizationId: string;
      documentId: string;
      documentName: string;
    }>(
      `SELECT t.id, t."instanceId", t."stepIndex", i.steps,
              d."organizationId", d.id AS "documentId", d.name AS "documentName"
         FROM workflow_tasks t
         JOIN workflow_instances i ON i.id = t."instanceId"
         JOIN documents d ON d.id = i."documentId"
        WHERE t.status = 'PENDING'
          AND t."dueAt" IS NOT NULL
          AND t."dueAt" < now()
          AND i.status = 'ACTIVE'
        LIMIT 200`,
    );

    let moved = 0;
    for (const task of overdue) {
      const target = task.steps?.[task.stepIndex]?.escalateTo;
      if (!target) continue;

      // Same rule as raising a task: escalating to somebody refused the record
      // would move the dead end rather than clear it, and would also expire the
      // original task, so the step would end up worse off than before.
      const holders = await this.resolveAssignees(target);
      const refused = await this.access.refusedBy(task.documentId, holders);
      const people = holders.filter((id) => !refused.has(id));
      if (people.length === 0) continue;

      await this.db.execute(
        `UPDATE workflow_tasks SET status = 'EXPIRED', "decidedAt" = now() WHERE id = $1`,
        [task.id],
      );
      for (const id of people) {
        await this.db.execute(
          `INSERT INTO workflow_tasks
             (id, "instanceId", "stepIndex", "stepKey", action, status, "assigneeType",
              "assigneeId", "grantedLevel", "dueAt")
           SELECT $1, "instanceId", "stepIndex", "stepKey", action, 'PENDING', 'USER',
                  $2, "grantedLevel", now() + interval '2 days'
             FROM workflow_tasks WHERE id = $3`,
          [newId(), id, task.id],
        );
      }

      await this.audit.record({
        organizationId: task.organizationId,
        actorLabel: 'Workflow engine',
        action: AuditAction.WORKFLOW_DECISION,
        resourceType: 'Document',
        resourceId: task.documentId,
        resourceName: task.documentName,
        metadata: { event: 'workflow_escalated', step: task.stepIndex, to: people.length },
      });

      moved += 1;
    }

    return moved;
  }
}
