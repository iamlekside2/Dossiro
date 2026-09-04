import { ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { AppConfig } from '../../common/config/configuration';
import { DatabaseService, newId } from '../../common/db';
import { AuditAction, UserStatus, type Session, type User } from '../../common/db';
import type { Permission } from '../../common/rbac/permissions';
import type { AuthUser, JwtPayload } from '../../common/types/auth.types';
import { AuditService } from '../audit/audit.service';

/** Consecutive failures before the account is temporarily locked. */
const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<{ app: AppConfig }, true>,
  ) {}

  /**
   * Which tenants can this address sign into?
   *
   * Email is unique per organisation, not globally, so the same person can
   * legitimately exist in two tenants (a consultant working for two clients).
   * The UI calls this first and shows a picker when there is more than one.
   */
  async resolveTenants(email: string) {
    const normalised = email.trim().toLowerCase();
    const domain = normalised.split('@')[1] ?? '';

    const live = await this.db.query<{ id: string; name: string; slug: string }>(
      `SELECT o.id, o.name, o.slug
         FROM users u
         JOIN organizations o ON o.id = u."organizationId"
        WHERE u.email = $1
          AND u."deletedAt" IS NULL
          AND u.status = ANY($2::"UserStatus"[])
          AND o.status NOT IN ('CLOSED', 'SUSPENDED')`,
      [normalised, [UserStatus.ACTIVE, UserStatus.INVITED]],
    );

    // A verified domain tells us the tenant even before an account exists,
    // which is what lets an administrator invite someone by address alone.
    const byDomain = domain
      ? await this.db.maybeOne<{ id: string; name: string }>(
          `SELECT o.id, o.name
             FROM organization_domains d
             JOIN organizations o ON o.id = d."organizationId"
            WHERE d.domain = $1 AND d."verifiedAt" IS NOT NULL
            LIMIT 1`,
          [domain],
        )
      : null;

    return {
      organizations: live,
      /// True when the address belongs to a tenant that has not invited them yet.
      domainMatch: byDomain,
    };
  }

  async login(
    email: string,
    password: string,
    ctx: { ip?: string; userAgent?: string; organizationId?: string; takeover?: boolean },
  ): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    const normalised = email.trim().toLowerCase();

    // Scope by tenant when one was chosen. Without this, a single-row read would
    // pick an arbitrary organisation for an address that exists in two — signing
    // someone into the wrong customer's records.
    const candidates = await this.db.query<User>(
      `SELECT * FROM users
        WHERE email = $1
          AND "deletedAt" IS NULL
          AND ($2::text IS NULL OR "organizationId" = $2)`,
      [normalised, ctx.organizationId ?? null],
    );

    if (candidates.length > 1) {
      throw new ConflictException({
        message: 'This address belongs to more than one organisation. Choose which one to sign into.',
        code: 'TENANT_AMBIGUOUS',
      });
    }

    const user = candidates[0] ?? null;

    // Uniform failure: never reveal whether the address exists.
    const fail = () => new UnauthorizedException('Invalid email or password');

    if (!user || !user.passwordHash) {
      // Burn comparable time so response latency does not leak account
      // existence to someone probing addresses.
      await argon2.hash(password).catch(() => undefined);
      throw fail();
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException('Account is temporarily locked. Try again later.');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('This account is not active');
    }

    const valid = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!valid) {
      const failures = user.failedLogins + 1;
      await this.db.execute(
        `UPDATE users SET "failedLogins" = $1, "lockedUntil" = $2, "updatedAt" = now() WHERE id = $3`,
        [
          failures,
          failures >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null,
          user.id,
        ],
      );
      await this.audit.record({
        organizationId: user.organizationId,
        actorId: user.id,
        action: AuditAction.LOGIN_FAILED,
        resourceType: 'User',
        resourceId: user.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        metadata: { failures },
      });
      throw fail();
    }

    // Single-session sign-in, when the organisation asks for it.
    //
    // Contentverse does this to protect a licence pool: with ten people sharing
    // five concurrent licences the sixth is simply told to come back later.
    // That is a commercial lock wearing a security costume, and it punishes the
    // person who did nothing wrong.
    //
    // Here it is a security control instead, and it is off unless a tenant
    // turns it on. Nobody is ever told to come back later: they are shown WHERE
    // the other session is and given the choice to end it. Which means the
    // refusal is also useful — if the device shown is not theirs, they have
    // just learned their password is compromised.
    await this.enforceSingleSession(user, ctx);

    const refreshToken = randomBytes(48).toString('base64url');
    const refreshTtlDays = this.config.get('app', { infer: true }).jwt.refreshTtlDays;

    const session = await this.db.one<Session>(
      `INSERT INTO sessions (id, "userId", "refreshTokenHash", "userAgent", ip, "expiresAt", "createdAt")
            VALUES ($1, $2, $3, $4, $5, $6, now())
         RETURNING *`,
      [
        newId(),
        user.id,
        this.hashToken(refreshToken),
        ctx.userAgent ?? null,
        ctx.ip ?? null,
        new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000),
      ],
    );

    await this.db.execute(
      `UPDATE users
          SET "failedLogins" = 0, "lockedUntil" = NULL, "lastLoginAt" = now(), "updatedAt" = now()
        WHERE id = $1`,
      [user.id],
    );

    const authUser = await this.buildAuthUser(user.id, session.id);

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.LOGIN,
      resourceType: 'User',
      resourceId: user.id,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });

    return { accessToken: this.signAccessToken(authUser, session.id), refreshToken, user: authUser };
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const hash = this.hashToken(refreshToken);
    const session = await this.db.maybeOne<Session>(
      `SELECT * FROM sessions WHERE "refreshTokenHash" = $1`,
      [hash],
    );

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expired. Please sign in again.');
    }

    // Rotate on every use. If an old token is ever replayed it will already be
    // revoked, which is the signal that it leaked.
    const nextToken = randomBytes(48).toString('base64url');
    const refreshTtlDays = this.config.get('app', { infer: true }).jwt.refreshTtlDays;

    const next = await this.db.transaction(async () => {
      // Conditional on still being live, so two parallel refreshes cannot both
      // succeed and hand out two valid sessions from one stolen token.
      const revoked = await this.db.execute(
        `UPDATE sessions SET "revokedAt" = now() WHERE id = $1 AND "revokedAt" IS NULL`,
        [session.id],
      );
      if (revoked === 0) {
        throw new UnauthorizedException('Session expired. Please sign in again.');
      }

      return this.db.one<Session>(
        `INSERT INTO sessions (id, "userId", "refreshTokenHash", "userAgent", ip, "expiresAt", "createdAt")
              VALUES ($1, $2, $3, $4, $5, $6, now())
           RETURNING *`,
        [
          newId(),
          session.userId,
          this.hashToken(nextToken),
          session.userAgent,
          session.ip,
          new Date(Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000),
        ],
      );
    });

    // The new session's id, not the revoked one's — the old token's session is
    // gone, and a JWT naming it would fail validation on the very next request.
    const authUser = await this.buildAuthUser(session.userId, next.id);
    return { accessToken: this.signAccessToken(authUser, next.id), refreshToken: nextToken };
  }

  async logout(sessionId: string): Promise<void> {
    await this.db
      .execute(`UPDATE sessions SET "revokedAt" = now() WHERE id = $1`, [sessionId])
      .catch(() => undefined);
  }

  /**
   * Assembles the identity used by every permission check: org-wide
   * permissions from roles, plus the full group closure.
   *
   * Group ancestors are included so a grant on "Finance" reaches somebody who
   * is only a direct member of "Finance / Accounts Payable".
   */
  async buildAuthUser(userId: string, sessionId?: string): Promise<AuthUser> {
    const user = await this.db.maybeOne<
      User & { organizationName: string; organizationStatus: string; isPlatform: boolean }
    >(
      `SELECT u.*,
              o.name        AS "organizationName",
              o.status      AS "organizationStatus",
              o."isPlatform"
         FROM users u
         JOIN organizations o ON o.id = u."organizationId"
        WHERE u.id = $1 AND u."deletedAt" IS NULL`,
      [userId],
    );
    if (!user) throw new UnauthorizedException('User not found');

    // Every route into a session comes through here — first login, token
    // validation and refresh alike — so this is the one place that has to
    // enforce tenant status. Revoking sessions on suspension is not enough on
    // its own: without this the user simply signs in again.
    if (user.organizationStatus === 'SUSPENDED') {
      throw new UnauthorizedException(
        `${user.organizationName} is suspended. Contact Calm Global to restore access.`,
      );
    }
    if (user.organizationStatus === 'CLOSED') {
      throw new UnauthorizedException(`${user.organizationName} is closed.`);
    }
    if (user.status === UserStatus.SUSPENDED || user.status === UserStatus.DEACTIVATED) {
      throw new UnauthorizedException('This account is not active');
    }

    const roles = await this.db.query<{ roleId: string; permissions: string[] }>(
      `SELECT ur."roleId", r.permissions
         FROM user_roles ur
         JOIN roles r ON r.id = ur."roleId"
        WHERE ur."userId" = $1`,
      [user.id],
    );

    const permissions = [...new Set(roles.flatMap((r) => r.permissions))] as Permission[];

    const groupIds = await this.groupClosure(user.id);
    const branchIds = await this.branchChain(user.branchId);

    return {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      displayName: user.displayName,
      tier: user.tier,
      isPlatform: user.isPlatform,
      organizationName: user.organizationName,
      permissions,
      groupIds,
      roleIds: roles.map((r) => r.roleId),
      branchIds,
      branchId: user.branchId,
      sessionId,
    };
  }

  async validateSession(payload: JwtPayload): Promise<AuthUser> {
    const session = await this.db.maybeOne<Session>(`SELECT * FROM sessions WHERE id = $1`, [
      payload.sid,
    ]);
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session is no longer valid');
    }
    return this.buildAuthUser(payload.sub, payload.sid);
  }

  // ---------------------------------------------------------------------------

  /**
   * Refuses a second simultaneous sign-in, for organisations that want it.
   *
   * Enabled per tenant through `organizations.settings.security.singleSession`,
   * because it is a policy decision, not a property of the software: a shared
   * scanning workstation wants it, a team of consultants on three devices each
   * does not. Off unless asked for.
   */
  private async enforceSingleSession(
    user: User,
    ctx: { ip?: string; userAgent?: string; takeover?: boolean },
  ): Promise<void> {
    const org = await this.db.maybeOne<{ settings: Record<string, unknown> | null }>(
      'SELECT settings FROM organizations WHERE id = $1',
      [user.organizationId],
    );

    const security = (org?.settings as { security?: { singleSession?: boolean } } | null)?.security;
    if (!security?.singleSession) return;

    const live = await this.db.query<Session>(
      `SELECT * FROM sessions
        WHERE "userId" = $1 AND "revokedAt" IS NULL AND "expiresAt" > now()
        ORDER BY "createdAt" DESC`,
      [user.id],
    );
    if (live.length === 0) return;

    if (!ctx.takeover) {
      // 409 rather than 401: the credentials were correct. Telling them it was
      // a bad password here would send someone to reset a password that works.
      throw new ConflictException({
        message: 'This account is already signed in somewhere else.',
        code: 'SESSION_ACTIVE',
        // Enough for the person to recognise their own device, and no more.
        // The full user-agent string and a precise address would tell an
        // attacker who guessed the password exactly who they are up against.
        sessions: live.map((s) => ({
          startedAt: s.createdAt,
          device: describeDevice(s.userAgent),
          from: maskIp(s.ip),
        })),
      });
    }

    await this.db.execute(
      `UPDATE sessions SET "revokedAt" = now()
        WHERE "userId" = $1 AND "revokedAt" IS NULL`,
      [user.id],
    );

    // Ending someone's session is a security event in its own right. If an
    // account is being passed around, or taken over, this is the line in the
    // trail that shows it.
    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.LOGOUT,
      resourceType: 'Session',
      resourceId: user.id,
      resourceName: user.email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { event: 'session_taken_over', endedSessions: live.length },
    });
  }

  /**
   * A posting to the Kano office also counts as being in the North West zone
   * above it, so a grant made at zone level reaches the offices beneath.
   *
   * One recursive query rather than a loop of reads: the old version issued one
   * round trip per level of the hierarchy. `CYCLE` is what makes recursion on
   * user-editable parent links safe — a branch made its own ancestor stops the
   * walk instead of running until the connection dies.
   */
  private async branchChain(branchId: string | null): Promise<string[]> {
    if (!branchId) return [];

    const rows = await this.db.query<{ id: string }>(
      `WITH RECURSIVE chain AS (
            SELECT id, "parentId" FROM branches WHERE id = $1
             UNION ALL
            SELECT b.id, b."parentId"
              FROM branches b
              JOIN chain c ON b.id = c."parentId"
          ) CYCLE id SET looped USING trail
        SELECT id FROM chain`,
      [branchId],
    );

    return rows.map((r) => r.id);
  }

  /** Every group the user is in, plus every group above those. */
  private async groupClosure(userId: string): Promise<string[]> {
    const rows = await this.db.query<{ id: string }>(
      `WITH RECURSIVE closure AS (
            SELECT g.id, g."parentId"
              FROM group_members m
              JOIN groups g ON g.id = m."groupId"
             WHERE m."userId" = $1
             UNION ALL
            SELECT g.id, g."parentId"
              FROM groups g
              JOIN closure c ON g.id = c."parentId"
          ) CYCLE id SET looped USING trail
        SELECT DISTINCT id FROM closure`,
      [userId],
    );

    return rows.map((r) => r.id);
  }

  private signAccessToken(user: AuthUser, sessionId: string): string {
    const payload: JwtPayload = {
      sub: user.id,
      org: user.organizationId,
      sid: sessionId,
      tier: user.tier,
    };
    return this.jwt.sign(payload);
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

/**
 * A phrase someone can recognise their own device by — "Chrome on Windows" —
 * without publishing the exact browser build to whoever guessed the password.
 */
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'an unrecognised device';

  const browser =
    /Edg\//.test(userAgent) ? 'Edge'
    : /OPR\//.test(userAgent) ? 'Opera'
    : /Chrome\//.test(userAgent) ? 'Chrome'
    : /Safari\//.test(userAgent) ? 'Safari'
    : /Firefox\//.test(userAgent) ? 'Firefox'
    : 'a browser';

  const platform =
    /Android/.test(userAgent) ? 'Android'
    : /iPhone|iPad|iOS/.test(userAgent) ? 'iOS'
    : /Windows/.test(userAgent) ? 'Windows'
    : /Mac OS X/.test(userAgent) ? 'macOS'
    : /Linux/.test(userAgent) ? 'Linux'
    : null;

  return platform ? `${browser} on ${platform}` : browser;
}

/**
 * Enough of the address to tell "my own office" from "somewhere I have never
 * been", with the host part dropped so the response is not a free lookup of
 * where the other person actually is.
 */
function maskIp(ip: string | null): string {
  if (!ip) return 'an unknown network';
  if (ip.includes(':')) {
    const head = ip.split(':').slice(0, 2).join(':');
    return `${head}:...`;
  }
  const parts = ip.split('.');
  return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.x` : ip;
}
