import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DatabaseService, Params, columns, every, newId, paginate } from '../../common/db';
import { AuditAction, ChannelType, type AuditEvent } from '../../common/db';
import { requestContext } from '../../common/context/request-context';

/**
 * Anything that survives JSON.stringify. Replaces Prisma's InputJsonValue.
 *
 * Object values may be `undefined`: callers build metadata with optional fields
 * (`subject: dto.userId ?? dto.groupId`), and JSON.stringify drops those keys
 * rather than failing. Rejecting them here would only force a cast at every
 * call site, which hides real mistakes along with this non-mistake.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue | undefined };

export interface AuditInput {
  organizationId: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: string | null;
  resourceName?: string | null;
  actorId?: string | null;
  /** Used when there is no user: a share viewer, a webhook, a scheduled job. */
  actorLabel?: string | null;
  changes?: JsonValue | null;
  metadata?: JsonValue | null;
  ip?: string | null;
  userAgent?: string | null;
  channel?: ChannelType;
}

/**
 * Append-only audit log with a hash chain (features 10 and 21).
 *
 * Each row hashes its own canonical content together with the previous row's
 * hash, so deleting or editing history breaks the chain and `verifyChain`
 * reports exactly where. This is what turns "we have logs" into evidence that
 * survives an auditor's scrutiny.
 *
 * There is intentionally no update or delete method on this service. The
 * database refuses them too — a trigger on `audit_events` rejects UPDATE and
 * DELETE outright, so the guarantee does not depend on this class.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly db: DatabaseService) {}

  async record(input: AuditInput): Promise<void> {
    // Read outside the transaction callback: still the same async context, but
    // it makes clear this is request state, not database state.
    const ctx = requestContext();

    try {
      await this.db.transaction(async () => {
        // Serialise per organisation so two concurrent writes cannot both
        // chain off the same predecessor and fork the history.
        await this.db.execute('SELECT pg_advisory_xact_lock(hashtext($1))', [input.organizationId]);

        const previous = await this.db.maybeOne<{ hash: string }>(
          `SELECT hash FROM audit_events
            WHERE "organizationId" = $1
            ORDER BY "createdAt" DESC
            LIMIT 1`,
          [input.organizationId],
        );

        const createdAt = new Date();
        const canonical = JSON.stringify({
          organizationId: input.organizationId,
          actorId: input.actorId ?? null,
          actorLabel: input.actorLabel ?? null,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId ?? null,
          changes: input.changes ?? null,
          createdAt: createdAt.toISOString(),
        });

        const hash = createHash('sha256')
          .update((previous?.hash ?? '') + canonical)
          .digest('hex');

        const c = columns({
          id: newId(),
          organizationId: input.organizationId,
          actorId: input.actorId ?? null,
          actorLabel: input.actorLabel ?? null,
          action: input.action,
          resourceType: input.resourceType,
          resourceId: input.resourceId ?? null,
          resourceName: input.resourceName ?? null,
          // jsonb columns take a JSON string; `null` must stay a SQL NULL
          // rather than become the JSON literal `null`, which is a value.
          changes: input.changes === undefined || input.changes === null ? null : JSON.stringify(input.changes),
          metadata: input.metadata === undefined || input.metadata === null ? null : JSON.stringify(input.metadata),
          // Falls back to the ambient request context so a call site cannot
          // silently omit the origin. An explicit value still wins: a share
          // viewer's address is not the address of whoever triggered the read.
          ip: input.ip ?? ctx?.ip ?? null,
          userAgent: input.userAgent ?? ctx?.userAgent ?? null,
          channel: input.channel ?? ChannelType.WEB,
          createdAt,
          hash,
          prevHash: previous?.hash ?? null,
        });

        await this.db.execute(
          `INSERT INTO audit_events (${c.names}) VALUES (${c.placeholders})`,
          c.values,
        );
      });
    } catch (err) {
      // An audit write must never take down the operation it is recording,
      // but a silent loss is a compliance gap - so it is logged loudly.
      this.logger.error(`AUDIT WRITE FAILED action=${input.action} resource=${input.resourceId}`, err as Error);
    }
  }

  /**
   * Recomputes the chain and reports the first row that does not match.
   * Run it on a schedule and surface the result in the compliance dashboard.
   */
  async verifyChain(organizationId: string): Promise<{ valid: boolean; checked: number; brokenAt?: string }> {
    const events = await this.db.query<AuditEvent>(
      `SELECT * FROM audit_events WHERE "organizationId" = $1 ORDER BY "createdAt" ASC`,
      [organizationId],
    );

    let prevHash: string | null = null;
    for (const e of events) {
      const canonical = JSON.stringify({
        organizationId: e.organizationId,
        actorId: e.actorId,
        actorLabel: e.actorLabel,
        action: e.action,
        resourceType: e.resourceType,
        resourceId: e.resourceId,
        changes: e.changes ?? null,
        createdAt: e.createdAt.toISOString(),
      });
      const expected: string = createHash('sha256')
        .update((prevHash ?? '') + canonical)
        .digest('hex');

      if (expected !== e.hash || e.prevHash !== prevHash) {
        return { valid: false, checked: events.length, brokenAt: e.id };
      }
      prevHash = e.hash;
    }

    return { valid: true, checked: events.length };
  }

  async query(
    organizationId: string,
    filters: {
      actorId?: string;
      /** One action, or several — "show me everything about sharing". */
      action?: AuditAction | AuditAction[];
      resourceType?: string;
      resourceId?: string;
      from?: Date;
      to?: Date;
      skip?: number;
      take?: number;
    },
  ) {
    const p = new Params();
    const where = every([
      `e."organizationId" = ${p.add(organizationId)}`,
      filters.actorId ? `e."actorId" = ${p.add(filters.actorId)}` : null,
      // A screen that offers "Sharing" as one filter means three actions, so
      // the list form is answered in one query rather than three round trips.
      Array.isArray(filters.action)
        ? filters.action.length
          ? `e.action = ANY(${p.add(filters.action)}::"AuditAction"[])`
          : null
        : filters.action
          ? `e.action = ${p.add(filters.action)}`
          : null,
      filters.resourceType ? `e."resourceType" = ${p.add(filters.resourceType)}` : null,
      filters.resourceId ? `e."resourceId" = ${p.add(filters.resourceId)}` : null,
      filters.from ? `e."createdAt" >= ${p.add(filters.from)}` : null,
      filters.to ? `e."createdAt" <= ${p.add(filters.to)}` : null,
    ]);

    const page = paginate(filters.take, filters.skip);

    // The actor join replaces Prisma's `include`, nesting the three columns the
    // caller wants under `actor` so the response shape does not change.
    const items = await this.db.query(
      `SELECT e.*,
              CASE WHEN u.id IS NULL THEN NULL ELSE
                json_build_object('id', u.id, 'displayName', u."displayName", 'email', u.email)
              END AS actor
         FROM audit_events e
         LEFT JOIN users u ON u.id = e."actorId"
        WHERE ${where}
        ORDER BY e."createdAt" DESC
        ${page.text}`,
      p.values,
    );

    const total = await this.db.count(
      `SELECT count(*) FROM audit_events e WHERE ${where}`,
      p.values,
    );

    return { items, total };
  }
}
