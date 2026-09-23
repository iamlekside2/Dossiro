import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, DatabaseService, newId } from '../../common/db';
import type { AuthUser } from '../../common/types/auth.types';
import { AuditService } from '../audit/audit.service';

export type Decision = 'KEEP' | 'DESTROY' | 'TRANSFER';

/**
 * How long a record is kept, and what happens when that time is up
 * (GOV-6, GOV-7, GOV-8).
 *
 * A schedule belongs to a document type, so the rule travels with the kind of
 * record rather than being attached one document at a time. The clock counts
 * either from ingest or from a date the customer nominated on the type — "six
 * years after they leave" is only expressible the second way.
 *
 * Nothing here destroys anything. When a period elapses the document enters a
 * review queue; a person decides; and a DESTROY decision soft-deletes it and
 * lets the existing purge job — with its legal-hold check and its recovery
 * window — do the only thing in the system that removes bytes.
 */
@Injectable()
export class RetentionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /**
   * When each document's retention elapses.
   *
   * Written once, as SQL, and reused by both the queue and the forecast. The
   * anchor date is the type's nominated field where the policy says so and the
   * document actually has a value in it, and the ingest date otherwise — a
   * contract with no expiry recorded is still reviewed eventually rather than
   * being kept forever by omission.
   */
  private readonly DUE_SQL = `
    WITH scheduled AS (
      SELECT d.id,
             d.name,
             d."organizationId",
             d."createdAt",
             t.name  AS "typeName",
             rp.name AS "policyName",
             rp."retainMonths",
             rp.action,
             rp."useTypeAnchor",
             -- The value of the type's anchor field, when there is one.
             av."valueDate" AS "anchorDate",
             af.name        AS "anchorField",
             CASE
               WHEN rp."useTypeAnchor" AND av."valueDate" IS NOT NULL
                 THEN av."valueDate" + make_interval(months => rp."retainMonths")
               ELSE d."createdAt" + make_interval(months => rp."retainMonths")
             END AS "dueAt"
        FROM documents d
        JOIN document_types t     ON t.id  = d."documentTypeId"
        JOIN retention_policies rp ON rp.id = t."retentionPolicyId"
        LEFT JOIN document_type_fields af
               ON af."documentTypeId" = t.id AND af."isRetentionAnchor"
        LEFT JOIN document_field_values av
               ON av."documentId" = d.id AND av."fieldId" = af.id
       WHERE d."organizationId" = $1
         AND d."deletedAt" IS NULL
    )
    SELECT s.*,
           -- A held record is listed with its hold rather than hidden, so a
           -- records manager can see why the queue is not shrinking.
           EXISTS (SELECT 1 FROM legal_holds h
                    WHERE h."documentId" = s.id AND h."releasedAt" IS NULL) AS "onHold",
           (SELECT h.reason FROM legal_holds h
             WHERE h."documentId" = s.id AND h."releasedAt" IS NULL
             ORDER BY h."placedAt" DESC LIMIT 1) AS "holdReason"
      FROM scheduled s
     WHERE NOT EXISTS (
             -- Already decided since it last came due. Without this a reviewed
             -- document reappears tomorrow and the queue is never empty, which
             -- teaches people to ignore it.
             SELECT 1 FROM retention_decisions rd
              WHERE rd."documentId" = s.id AND rd."decidedAt" >= s."dueAt"
           )`;

  /** What is due for review now. */
  async due(user: AuthUser, { take = 100, skip = 0 } = {}) {
    const items = await this.db.query(
      `${this.DUE_SQL} AND s."dueAt" <= now()
        ORDER BY s."dueAt" ASC
        LIMIT ${Math.min(take, 200)} OFFSET ${Math.max(skip, 0)}`,
      [user.organizationId],
    );

    const counts = await this.db.maybeOne<{ total: string; held: string }>(
      `SELECT count(*) AS total,
              count(*) FILTER (WHERE q."onHold") AS held
         FROM (${this.DUE_SQL} AND s."dueAt" <= now()) q`,
      [user.organizationId],
    );

    return {
      items,
      total: Number(counts?.total ?? 0),
      // Surfaced separately because it is the figure that explains a queue
      // that will not clear: these cannot be actioned at all until released.
      onHold: Number(counts?.held ?? 0),
    };
  }

  /** What falls due inside a window — the thing a records manager plans around. */
  async upcoming(user: AuthUser, days = 90) {
    const items = await this.db.query(
      `${this.DUE_SQL}
         AND s."dueAt" > now()
         AND s."dueAt" <= now() + make_interval(days => $2)
       ORDER BY s."dueAt" ASC
       LIMIT 200`,
      [user.organizationId, days],
    );
    return { items, total: items.length, windowDays: days };
  }

  /** Everything known about one document's schedule, including held state. */
  async forDocument(user: AuthUser, documentId: string) {
    const row = await this.db.maybeOne(
      `${this.DUE_SQL} AND s.id = $2`,
      [user.organizationId, documentId],
    );

    if (row) return row;

    // No row means either no schedule or already decided. Both are ordinary
    // answers, and saying which is more useful than a 404.
    const exists = await this.db.maybeOne<{ id: string; documentTypeId: string | null }>(
      'SELECT id, "documentTypeId" FROM documents WHERE id = $1 AND "organizationId" = $2',
      [documentId, user.organizationId],
    );
    if (!exists) throw new NotFoundException('No such document.');

    const last = await this.db.maybeOne(
      `SELECT decision, reason, "decidedAt", "dueAt" FROM retention_decisions
        WHERE "documentId" = $1 ORDER BY "decidedAt" DESC LIMIT 1`,
      [documentId],
    );

    return {
      id: documentId,
      scheduled: false,
      reason: exists.documentTypeId
        ? 'This document’s type has no retention schedule.'
        : 'This document has no type, so no schedule applies.',
      lastDecision: last,
    };
  }

  /**
   * Records what was decided, and acts on it.
   *
   * Refused under legal hold. A hold outranks retention, an owner and an
   * administrator (GOV-8), and the refusal has to come from the one place that
   * would otherwise act — saying so in the interface is not the same thing.
   */
  async decide(user: AuthUser, documentId: string, decision: Decision, reason: string) {
    if (!reason?.trim()) {
      throw new BadRequestException('A disposition needs a stated reason.');
    }

    const row = await this.db.maybeOne<{
      id: string;
      name: string;
      dueAt: Date;
      policyName: string | null;
      onHold: boolean;
      holdReason: string | null;
    }>(`${this.DUE_SQL} AND s.id = $2`, [user.organizationId, documentId]);

    if (!row) {
      throw new NotFoundException('That document is not awaiting a retention decision.');
    }

    if (row.onHold) {
      throw new ConflictException(
        `Under legal hold${row.holdReason ? `: ${row.holdReason}` : ''}. `
          + 'A hold outranks retention — release it first.',
      );
    }

    await this.db.transaction(async () => {
      await this.db.execute(
        `INSERT INTO retention_decisions
           (id, "organizationId", "documentId", decision, reason, "policyName", "dueAt", "decidedById")
         VALUES ($1, $2, $3, $4::"DispositionDecision", $5, $6, $7, $8)`,
        [newId(), user.organizationId, documentId, decision, reason.trim(),
         row.policyName, row.dueAt, user.id],
      );

      // DESTROY sends it to the recycle bin rather than removing it. The purge
      // job is the only thing that deletes bytes, and it re-checks the hold
      // and the recovery window before it does.
      if (decision === 'DESTROY') {
        await this.db.execute(
          `UPDATE documents
              SET "deletedAt" = now(), "deletedById" = $2,
                  "purgeAfter" = now() + interval '90 days', "updatedAt" = now()
            WHERE id = $1`,
          [documentId, user.id],
        );
      }
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: decision === 'DESTROY' ? AuditAction.DOCUMENT_DELETE : AuditAction.SETTINGS_CHANGE,
      resourceType: 'Document',
      resourceId: documentId,
      resourceName: row.name,
      metadata: {
        event: 'retention_disposition',
        decision,
        reason: reason.trim(),
        policy: row.policyName,
        // The audit payload is JSON, so the date goes in as a string rather
        // than relying on whatever a Date serialises to on the way through.
        dueAt: row.dueAt instanceof Date ? row.dueAt.toISOString() : String(row.dueAt),
      },
    });

    return { documentId, decision, recorded: true };
  }

  /** What has been decided, for a compliance report (GOV-10). */
  async history(user: AuthUser, { take = 100 } = {}) {
    const items = await this.db.query(
      `SELECT rd.id, rd.decision, rd.reason, rd."policyName", rd."dueAt", rd."decidedAt",
              d.name AS "documentName",
              CASE WHEN u.id IS NULL THEN NULL
                   ELSE json_build_object('id', u.id, 'displayName', u."displayName") END AS "decidedBy"
         FROM retention_decisions rd
         JOIN documents d ON d.id = rd."documentId"
         LEFT JOIN users u ON u.id = rd."decidedById"
        WHERE rd."organizationId" = $1
        ORDER BY rd."decidedAt" DESC
        LIMIT ${Math.min(take, 200)}`,
      [user.organizationId],
    );
    return { items, total: items.length };
  }

  /**
   * The schedules themselves, with how much each one governs.
   *
   * A policy nobody has attached to a type is a rule that will never fire, and
   * the count is the only thing that distinguishes the two on sight.
   */
  async policies(user: AuthUser) {
    const items = await this.db.query(
      `SELECT rp.id, rp.name, rp."retainMonths", rp.anchor, rp.action, rp."useTypeAnchor",
              rp."createdAt",
              COALESCE(t.n, 0) AS "typeCount",
              COALESCE(d.n, 0) AS "documentCount"
         FROM retention_policies rp
         LEFT JOIN LATERAL (SELECT count(*) AS n FROM document_types
                             WHERE "retentionPolicyId" = rp.id) t ON TRUE
         LEFT JOIN LATERAL (SELECT count(*) AS n FROM documents doc
                             JOIN document_types dt ON dt.id = doc."documentTypeId"
                            WHERE dt."retentionPolicyId" = rp.id
                              AND doc."deletedAt" IS NULL) d ON TRUE
        WHERE rp."organizationId" = $1
        ORDER BY rp."retainMonths" DESC, rp.name ASC`,
      [user.organizationId],
    );
    return { items, total: items.length };
  }
}
