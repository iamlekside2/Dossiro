import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  DatabaseService,
  SupportScope,
  SupportSessionState,
  newId,
} from '../../common/db';
import type { AuthUser } from '../../common/types/auth.types';
import { AuditService } from '../audit/audit.service';

/** Hard ceiling on a break-glass window; the schema enforces it too. */
const BREAK_GLASS_MINUTES = 30;

/** The longest an ordinary support window may run. */
const MAX_HOURS = 24;

/** Scope ordering, for "does this session cover what is being asked". */
const REACH: Record<SupportScope, number> = {
  METADATA: 0,
  CONFIGURATION: 1,
  DOCUMENTS: 2,
};

export interface RequestInput {
  organizationId: string;
  scope: SupportScope;
  reason: string;
  hours?: number;
  breakGlass?: boolean;
}

/**
 * Support access to a tenancy (PLT-2).
 *
 * Operating the platform confers no sight of customer records. That holds by
 * construction — every query is scoped to the caller's own organisation, and
 * an operator's is the platform realm, which holds nothing. This is the single
 * controlled exception, and it is built so the tenant is never in the dark:
 * scoped, reasoned, approved for anything touching documents, expiring,
 * revocable by them instantly, and written to their audit trail as well as
 * ours.
 *
 * Two audit entries per event, deliberately. One in the operator's realm and
 * one in the tenant's. A trail the subject cannot read is a trail that
 * protects only the party keeping it.
 */
@Injectable()
export class SupportService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /* -- Asking ---------------------------------------------------------------- */

  /**
   * An operator asks to look.
   *
   * Metadata and configuration start active: they expose structure, not
   * content, and making a customer approve every routine diagnosis produces
   * approval fatigue rather than safety. Documents wait for a named person.
   */
  async request(user: AuthUser, input: RequestInput) {
    if (!user.isPlatform) {
      throw new ForbiddenException('Only platform operators request support access.');
    }

    const tenant = await this.db.maybeOne<{ id: string; name: string; isPlatform: boolean }>(
      'SELECT id, name, "isPlatform" FROM organizations WHERE id = $1',
      [input.organizationId],
    );
    if (!tenant) throw new NotFoundException('No such tenant.');
    if (tenant.isPlatform) {
      throw new BadRequestException('The platform organisation is not a tenant to be supported.');
    }

    const breakGlass = Boolean(input.breakGlass);
    const hours = breakGlass
      ? BREAK_GLASS_MINUTES / 60
      : Math.min(Math.max(input.hours ?? 4, 1), MAX_HOURS);

    // Documents need a named approver. Break-glass is the exception, and it
    // buys its exemption with a thirty-minute cap and a mandatory review.
    const needsApproval = input.scope === SupportScope.DOCUMENTS && !breakGlass;
    const state = needsApproval ? SupportSessionState.REQUESTED : SupportSessionState.ACTIVE;

    const id = newId();
    const session = await this.db.one(
      `INSERT INTO support_sessions
         (id, "organizationId", "operatorId", scope, state, reason, "expiresAt", "breakGlass")
       VALUES ($1, $2, $3, $4, $5, $6, now() + ($7 || ' hours')::interval, $8)
       RETURNING *`,
      [id, tenant.id, user.id, input.scope, state, input.reason.trim(), String(hours), breakGlass],
    );

    await this.record(tenant.id, user, 'support_access_requested', {
      scope: input.scope,
      reason: input.reason.trim(),
      breakGlass,
      state,
      expiresAt: session.expiresAt,
    });

    return this.get(user, id);
  }

  /* -- The tenant's side ------------------------------------------------------ */

  /** A named person in the tenancy lets the operator in. */
  async approve(user: AuthUser, id: string) {
    const session = await this.forTenant(user, id);

    if (session.state !== SupportSessionState.REQUESTED) {
      throw new BadRequestException(`This request is already ${session.state.toLowerCase()}.`);
    }

    await this.db.execute(
      `UPDATE support_sessions
          SET state = 'ACTIVE', "approvedAt" = now(), "approvedById" = $1
        WHERE id = $2`,
      [user.id, id],
    );

    await this.record(session.organizationId, user, 'support_access_approved', {
      scope: session.scope,
      operatorId: session.operatorId,
    });

    return this.get(user, id);
  }

  async refuse(user: AuthUser, id: string, reason?: string) {
    const session = await this.forTenant(user, id);

    if (session.state !== SupportSessionState.REQUESTED) {
      throw new BadRequestException(`This request is already ${session.state.toLowerCase()}.`);
    }

    await this.db.execute(
      `UPDATE support_sessions SET state = 'REFUSED', "revokedAt" = now(),
              "revokedById" = $1, "revokedReason" = $2
        WHERE id = $3`,
      [user.id, reason?.trim() ?? null, id],
    );

    await this.record(session.organizationId, user, 'support_access_refused', {
      scope: session.scope,
      reason: reason?.trim() ?? null,
    });

    return this.get(user, id);
  }

  /**
   * Either side may end a session, and the tenant needs no reason and no
   * permission from us. "Their records manager can revoke the session
   * instantly" is only true if it is one call with nothing in the way.
   */
  async revoke(user: AuthUser, id: string, reason?: string) {
    const session = await this.db.maybeOne<{
      id: string;
      organizationId: string;
      operatorId: string;
      scope: SupportScope;
      state: SupportSessionState;
    }>('SELECT * FROM support_sessions WHERE id = $1', [id]);
    if (!session) throw new NotFoundException('No such support session.');

    const isTheirs = session.organizationId === user.organizationId;
    const isTheOperator = user.isPlatform && session.operatorId === user.id;
    if (!isTheirs && !isTheOperator) {
      throw new ForbiddenException('That support session does not concern you.');
    }

    if (session.state !== SupportSessionState.ACTIVE) {
      throw new BadRequestException(`This session is already ${session.state.toLowerCase()}.`);
    }

    await this.db.execute(
      `UPDATE support_sessions SET state = 'REVOKED', "revokedAt" = now(),
              "revokedById" = $1, "revokedReason" = $2
        WHERE id = $3`,
      [user.id, reason?.trim() ?? null, id],
    );

    await this.record(session.organizationId, user, 'support_access_revoked', {
      scope: session.scope,
      by: isTheirs ? 'tenant' : 'operator',
      reason: reason?.trim() ?? null,
    });

    return this.get(user, id);
  }

  /* -- Reading ---------------------------------------------------------------- */

  /** One session, with what was looked at during it. */
  async get(user: AuthUser, id: string) {
    const session = await this.db.maybeOne<Record<string, unknown>>(
      `SELECT s.*,
              o.name AS "organizationName",
              op."displayName" AS "operatorName",
              ap."displayName" AS "approvedByName",
              rv."displayName" AS "revokedByName"
         FROM support_sessions s
         JOIN organizations o ON o.id = s."organizationId"
         JOIN users op ON op.id = s."operatorId"
         LEFT JOIN users ap ON ap.id = s."approvedById"
         LEFT JOIN users rv ON rv.id = s."revokedById"
        WHERE s.id = $1`,
      [id],
    );
    if (!session) throw new NotFoundException('No such support session.');

    const visible =
      session.organizationId === user.organizationId ||
      (user.isPlatform && session.operatorId === user.id);
    if (!visible) throw new ForbiddenException('That support session does not concern you.');

    const views = await this.db.query(
      `SELECT "documentName", "viewedAt", "dwellSeconds"
         FROM support_session_views
        WHERE "sessionId" = $1
        ORDER BY "viewedAt" DESC`,
      [id],
    );

    return { ...this.withLiveState(session), views };
  }

  /**
   * Every session touching this tenancy.
   *
   * The tenant sees exactly what the operator sees. That is the point: a list
   * only one party can read would make the promise unverifiable by the party
   * it is made to.
   */
  async listForTenant(user: AuthUser, organizationId?: string) {
    // A tenant asking about somebody else is refused rather than quietly
    // handed their own rows. Silently substituting the answer to a different
    // question is how people come to believe they have checked something they
    // have not.
    if (!user.isPlatform && organizationId && organizationId !== user.organizationId) {
      throw new ForbiddenException('You can only see support access to your own organisation.');
    }

    const target = user.isPlatform ? organizationId : user.organizationId;
    if (!target) throw new BadRequestException('Which tenant?');

    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT s.*, op."displayName" AS "operatorName", ap."displayName" AS "approvedByName",
              COALESCE(v.n, 0) AS "viewCount"
         FROM support_sessions s
         JOIN users op ON op.id = s."operatorId"
         LEFT JOIN users ap ON ap.id = s."approvedById"
         LEFT JOIN LATERAL (SELECT count(*) AS n FROM support_session_views
                             WHERE "sessionId" = s.id) v ON TRUE
        WHERE s."organizationId" = $1
        ORDER BY s."requestedAt" DESC
        LIMIT 200`,
      [target],
    );

    const items = rows.map((r) => this.withLiveState(r));
    return { items, total: items.length, active: items.filter((i) => i.state === 'ACTIVE').length };
  }

  /* -- Enforcement ------------------------------------------------------------ */

  /**
   * The session that lets this operator reach this tenancy at this scope, or a
   * refusal explaining which part is missing.
   *
   * Expiry is decided here rather than by a sweep, so a window closes on time
   * whether or not a scheduled job happens to have run.
   */
  async requireSession(user: AuthUser, organizationId: string, scope: SupportScope) {
    if (!user.isPlatform) {
      throw new ForbiddenException('This is a support route.');
    }

    const session = await this.db.maybeOne<{
      id: string;
      scope: SupportScope;
      expiresAt: Date;
    }>(
      `SELECT id, scope, "expiresAt"
         FROM support_sessions
        WHERE "organizationId" = $1
          AND "operatorId" = $2
          AND state = 'ACTIVE'
          AND "expiresAt" > now()
        ORDER BY "expiresAt" DESC
        LIMIT 1`,
      [organizationId, user.id],
    );

    if (!session) {
      throw new ForbiddenException(
        'No approved support session for this tenant. Request access, with a reason they will read.',
      );
    }

    if (REACH[session.scope] < REACH[scope]) {
      throw new ForbiddenException(
        `This session covers ${session.scope.toLowerCase()} only. `
          + `Reaching ${scope.toLowerCase()} needs its own request.`,
      );
    }

    return session;
  }

  /**
   * Records that an operator opened a record, in the session and in the
   * tenant's own trail.
   *
   * Called by whatever serves the record. Looking at something without this is
   * the failure mode the whole feature exists to prevent, so it is one call
   * and it never throws on the caller's path.
   */
  async noteView(sessionId: string, organizationId: string, user: AuthUser, doc: { id: string; name: string }) {
    await this.db.execute(
      `INSERT INTO support_session_views (id, "sessionId", "documentId", "documentName")
       VALUES ($1, $2, $3, $4)`,
      [newId(), sessionId, doc.id, doc.name],
    );

    await this.record(organizationId, user, 'support_document_opened', {
      documentId: doc.id,
      documentName: doc.name,
      sessionId,
    });
  }

  /* -- Helpers ---------------------------------------------------------------- */

  /** The session, confirmed to belong to the caller's tenancy. */
  private async forTenant(user: AuthUser, id: string) {
    const session = await this.db.maybeOne<{
      id: string;
      organizationId: string;
      operatorId: string;
      scope: SupportScope;
      state: SupportSessionState;
    }>('SELECT * FROM support_sessions WHERE id = $1', [id]);

    if (!session) throw new NotFoundException('No such support session.');
    if (session.organizationId !== user.organizationId) {
      throw new ForbiddenException('That support session does not concern your organisation.');
    }
    return session;
  }

  /**
   * An ACTIVE row whose window has passed is expired, whatever the column
   * says. Deciding it on read means a lapsed session never looks live.
   */
  private withLiveState(row: Record<string, unknown>) {
    const expired =
      row.state === 'ACTIVE' && row.expiresAt instanceof Date && row.expiresAt.getTime() <= Date.now();
    return { ...row, state: expired ? 'EXPIRED' : row.state };
  }

  /**
   * One event, written to both trails.
   *
   * The tenant's copy is the one that matters. Ours proves we recorded it;
   * theirs is what lets them check us without asking.
   */
  private async record(
    tenantId: string,
    actor: AuthUser,
    event: string,
    metadata: Record<string, unknown>,
  ) {
    const payload = {
      action: AuditAction.SETTINGS_CHANGE,
      resourceType: 'SupportSession',
      actorId: actor.id,
      metadata: { event, ...metadata },
    } as const;

    await this.audit.record({ ...payload, organizationId: tenantId });

    // Only when they differ — a tenant revoking their own session would
    // otherwise be recorded twice in the same trail.
    if (actor.organizationId !== tenantId) {
      await this.audit.record({
        ...payload,
        organizationId: actor.organizationId,
        metadata: { ...payload.metadata, tenantId },
      });
    }
  }
}
