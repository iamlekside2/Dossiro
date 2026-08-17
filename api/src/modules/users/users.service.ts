import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { AppConfig } from '../../common/config/configuration';
import { DatabaseService, Params, every, newId, paginate } from '../../common/db';
import { AuditAction, OrgStatus, UserStatus, UserTier, type User } from '../../common/db';
import { LicenseService } from '../../common/licensing/license.service';
import type { AuthUser } from '../../common/types/auth.types';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../channels/email.service';

const INVITE_TTL_DAYS = 14;

/**
 * People inside a tenant.
 *
 * There is no self-serve signup. Every internal user is invited by an
 * administrator of their own organisation, which is what keeps a tenant's
 * membership deliberate — the alternative is anyone with a matching email
 * domain walking into a customer's records.
 *
 * External share-link recipients are not users at all and never appear here.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly license: LicenseService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly config: ConfigService<{ app: AppConfig }, true>,
  ) {}

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** The link the invitee clicks. Built from WEB_BASE_URL, not the request. */
  inviteUrl(token: string): string {
    return `${this.config.get('app', { infer: true }).webBaseUrl}/accept-invite?token=${token}`;
  }

  /**
   * Delivers an invitation.
   *
   * Never throws: a mail failure must not roll back an invitation that was
   * created successfully, or the administrator sees an error for a person who
   * now exists.
   *
   * Returns what actually happened rather than a boolean. `disabled` is the
   * important case — SMTP off means nothing was sent, and reporting that as
   * success would have an administrator waiting on an email that is never
   * coming. The caller shows the link instead.
   */
  private async deliverInvite(opts: {
    to: string;
    displayName: string;
    organizationName: string;
    invitedBy?: string;
    token: string;
    expiresAt: Date | null;
  }): Promise<'sent' | 'disabled' | 'failed'> {
    if (!this.config.get('app', { infer: true }).email.enabled) {
      return 'disabled';
    }
    const url = this.inviteUrl(opts.token);
    const expires = opts.expiresAt
      ? opts.expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      : 'in 14 days';

    const text = [
      `${opts.displayName},`,
      '',
      opts.invitedBy
        ? `${opts.invitedBy} has invited you to ${opts.organizationName} on Arkin.`
        : `You have been invited to set up ${opts.organizationName} on Arkin.`,
      '',
      'Open this link to choose a password and get in:',
      url,
      '',
      `The link works once and expires on ${expires}.`,
      'If you were not expecting this, ignore it and nothing happens.',
    ].join('\n');

    try {
      await this.email.send(opts.to, `You have been invited to ${opts.organizationName}`, text);
      return 'sent';
    } catch {
      return 'failed';
    }
  }

  /**
   * Invitation for a tenant's first administrator, sent at provisioning time.
   * Worded differently from a colleague invitation: nobody invited them, and
   * they are about to set the organisation up rather than join it.
   */
  async sendOwnerInvitation(opts: {
    to: string;
    displayName: string;
    organizationName: string;
    token: string;
    expiresAt: Date | null;
  }): Promise<'sent' | 'disabled' | 'failed'> {
    return this.deliverInvite(opts);
  }

  /** Backs Administration › Personnel. */
  async list(user: AuthUser, params: { query?: string; status?: UserStatus; skip?: number; take?: number }) {
    const p = new Params();
    const where = every([
      `u."organizationId" = ${p.add(user.organizationId)}`,
      `u."deletedAt" IS NULL`,
      params.status ? `u.status = ${p.add(params.status)}` : null,
      // ILIKE rather than LIKE — the Prisma equivalent was mode: 'insensitive'.
      // The pattern is escaped so a name containing % does not match everything.
      params.query ? `(u."displayName" ILIKE ${p.add(contains(params.query))} ESCAPE '\\'
                    OR u.email ILIKE ${p.add(contains(params.query))} ESCAPE '\\')` : null,
    ]);

    const page = paginate(params.take, params.skip);

    // Roles, groups and branch came from Prisma `include`s. Aggregating them in
    // the query keeps this one round trip instead of four, and keeps the
    // response shape identical to what the web client already expects.
    const items = await this.db.query(
      `SELECT u.id, u.email, u."displayName", u."jobTitle", u.tier, u.status,
              u."lastLoginAt", u."invitedAt", u."mfaEnabled",
              COALESCE(r.roles, '[]'::json)  AS roles,
              COALESCE(g.groups, '[]'::json) AS "groupMemberships",
              CASE WHEN b.id IS NULL THEN NULL
                   ELSE json_build_object('id', b.id, 'name', b.name) END AS branch
         FROM users u
         LEFT JOIN branches b ON b.id = u."branchId"
         LEFT JOIN LATERAL (
                SELECT json_agg(json_build_object(
                         'role', json_build_object('id', ro.id, 'key', ro.key, 'name', ro.name)
                       )) AS roles
                  FROM user_roles ur
                  JOIN roles ro ON ro.id = ur."roleId"
                 WHERE ur."userId" = u.id
              ) r ON TRUE
         LEFT JOIN LATERAL (
                SELECT json_agg(json_build_object(
                         'group', json_build_object('id', gr.id, 'name', gr.name)
                       )) AS groups
                  FROM group_members gm
                  JOIN groups gr ON gr.id = gm."groupId"
                 WHERE gm."userId" = u.id
              ) g ON TRUE
        WHERE ${where}
        ORDER BY u.status ASC, u."displayName" ASC
        ${page.text}`,
      p.values,
    );

    const total = await this.db.count(`SELECT count(*) FROM users u WHERE ${where}`, p.values);

    return { items, total };
  }

  /**
   * Invites someone into the caller's organisation.
   *
   * Returns the raw token once. In production it goes into the invitation
   * email and is never recoverable — only its hash is stored.
   */
  async invite(
    actor: AuthUser,
    input: { email: string; displayName: string; tier?: UserTier; roleKey?: string; jobTitle?: string },
  ) {
    const email = input.email.trim().toLowerCase();
    if (!email.includes('@')) throw new BadRequestException('A valid email address is required');

    // You cannot invite someone into a tier above your own.
    const tier = input.tier ?? UserTier.CONTRIBUTOR;
    if (!this.canGrantTier(actor.tier, tier)) {
      throw new ForbiddenException(`You cannot invite someone as ${tier}.`);
    }

    const existing = await this.db.maybeOne<User>(
      `SELECT * FROM users WHERE "organizationId" = $1 AND email = $2`,
      [actor.organizationId, email],
    );
    if (existing && existing.deletedAt === null) {
      throw new ConflictException(
        existing.status === UserStatus.INVITED
          ? 'That person has already been invited. Resend the invitation instead.'
          : 'Someone with that address is already in this organisation.',
      );
    }

    await this.assertSeatAvailable(actor.organizationId);

    const role = await this.db.maybeOne<{ id: string }>(
      `SELECT id FROM roles WHERE "organizationId" = $1 AND key = $2`,
      [actor.organizationId, input.roleKey ?? this.defaultRoleKey(tier)],
    );

    const token = randomBytes(32).toString('base64url');
    const inviteExpiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    const userId = newId();

    // The user and their starting role are one unit: a person created without
    // the role they were invited as would silently have no permissions.
    const user = await this.db.transaction(async () => {
      const created = await this.db.one<User>(
        `INSERT INTO users (id, "organizationId", email, "displayName", "jobTitle", tier, status,
                            "inviteTokenHash", "inviteExpiresAt", "invitedAt", "invitedById",
                            "createdAt", "updatedAt")
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), $10, now(), now())
           RETURNING *`,
        [
          userId,
          actor.organizationId,
          email,
          input.displayName.trim(),
          input.jobTitle ?? null,
          tier,
          UserStatus.INVITED,
          this.hashToken(token),
          inviteExpiresAt,
          actor.id,
        ],
      );

      if (role) {
        await this.db.execute(
          `INSERT INTO user_roles (id, "userId", "roleId", "assignedAt") VALUES ($1, $2, $3, now())`,
          [newId(), created.id, role.id],
        );
      }

      return created;
    });

    const org = await this.db.one<{ name: string }>(
      `SELECT name FROM organizations WHERE id = $1`,
      [actor.organizationId],
    );

    const delivery = await this.deliverInvite({
      to: email,
      displayName: user.displayName,
      organizationName: org.name,
      invitedBy: actor.displayName,
      token,
      expiresAt: user.inviteExpiresAt,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: AuditAction.USER_CREATE,
      resourceType: 'User',
      resourceId: user.id,
      resourceName: email,
      metadata: { tier, invited: true, delivery },
    });

    return {
      user: { id: user.id, email: user.email, displayName: user.displayName, status: user.status },
      // Returned so an administrator can pass the link on by hand when mail is
      // not configured. Once SMTP is live the UI should stop showing it.
      inviteToken: token,
      inviteUrl: this.inviteUrl(token),
      delivery,
      expiresAt: user.inviteExpiresAt,
    };
  }

  /** Public: what the invitee sees before committing to a password. */
  async describeInvite(token: string) {
    const user = await this.findByInviteToken(token);
    return {
      email: user.email,
      displayName: user.displayName,
      organizationName: user.organizationName,
      expiresAt: user.inviteExpiresAt,
    };
  }

  /**
   * Public: exchanges a valid invitation for an active account.
   *
   * The token is cleared on use, so an invitation email that leaks later is
   * worthless.
   */
  async acceptInvite(token: string, password: string) {
    const user = await this.findByInviteToken(token);

    if (password.length < 12) {
      throw new BadRequestException('Choose a password of at least 12 characters.');
    }

    // The WHERE still carries the token hash, so two clicks on the same link
    // race for one row and the second finds nothing rather than resetting the
    // password of an account that is already live.
    const activated = await this.db.maybeOne<{
      id: string;
      email: string;
      displayName: string;
      organizationId: string;
    }>(
      `UPDATE users
          SET "passwordHash" = $1,
              status = $2,
              "inviteTokenHash" = NULL,
              "inviteExpiresAt" = NULL,
              "updatedAt" = now()
        WHERE id = $3 AND "inviteTokenHash" = $4
    RETURNING id, email, "displayName", "organizationId"`,
      [await argon2.hash(password), UserStatus.ACTIVE, user.id, this.hashToken(token)],
    );

    if (!activated) {
      throw new NotFoundException('This invitation is no longer valid. Ask for a new one.');
    }

    await this.audit.record({
      organizationId: activated.organizationId,
      actorId: activated.id,
      action: AuditAction.USER_UPDATE,
      resourceType: 'User',
      resourceId: activated.id,
      resourceName: activated.email,
      metadata: { event: 'invitation_accepted' },
    });

    return activated;
  }

  async resendInvitation(actor: AuthUser, userId: string) {
    const user = await this.requireInOrg(actor, userId);
    if (user.status !== UserStatus.INVITED) {
      throw new BadRequestException('That person has already accepted their invitation.');
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    await this.db.execute(
      `UPDATE users
          SET "inviteTokenHash" = $1, "inviteExpiresAt" = $2, "invitedAt" = now(), "updatedAt" = now()
        WHERE id = $3`,
      [this.hashToken(token), expiresAt, userId],
    );

    const org = await this.db.one<{ name: string }>(
      `SELECT name FROM organizations WHERE id = $1`,
      [actor.organizationId],
    );

    const delivery = await this.deliverInvite({
      to: user.email,
      displayName: user.displayName,
      organizationName: org.name,
      invitedBy: actor.displayName,
      token,
      expiresAt,
    });

    // Reissuing invalidates the previous token, so an old email stops working.
    return { inviteToken: token, inviteUrl: this.inviteUrl(token), delivery, expiresAt };
  }

  async changeTier(actor: AuthUser, userId: string, tier: UserTier) {
    const user = await this.requireInOrg(actor, userId);

    if (!this.canGrantTier(actor.tier, tier)) {
      throw new ForbiddenException(`You cannot assign the ${tier} tier.`);
    }
    if (user.id === actor.id) {
      throw new ForbiddenException('You cannot change your own tier.');
    }

    const updated = await this.db.one<User>(
      `UPDATE users SET tier = $1, "updatedAt" = now() WHERE id = $2 RETURNING *`,
      [tier, userId],
    );

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: AuditAction.ROLE_CHANGE,
      resourceType: 'User',
      resourceId: userId,
      resourceName: user.email,
      changes: { tier: { from: user.tier, to: tier } },
    });

    return updated;
  }

  /**
   * Suspending preserves the person's audit history and revokes every active
   * session and share link they created. It is not a delete.
   */
  async suspend(actor: AuthUser, userId: string) {
    const user = await this.requireInOrg(actor, userId);
    if (user.id === actor.id) throw new ForbiddenException('You cannot suspend yourself.');

    // Platform staff run tenant provisioning for every customer. Suspending one
    // from inside a tenant would lock Calm Global out of its own platform,
    // recoverable only with the bootstrap key.
    if (user.isPlatformStaff) {
      throw new ForbiddenException(
        'This account operates the platform and cannot be suspended from within an organisation.',
      );
    }

    // One transaction: a suspended account whose sessions survived is still
    // signed in, which is the opposite of what suspension means.
    await this.db.transaction(async () => {
      await this.db.execute(
        `UPDATE users SET status = $1, "updatedAt" = now() WHERE id = $2`,
        [UserStatus.SUSPENDED, userId],
      );
      await this.db.execute(
        `UPDATE sessions SET "revokedAt" = now() WHERE "userId" = $1 AND "revokedAt" IS NULL`,
        [userId],
      );
      await this.db.execute(
        `UPDATE share_links SET "revokedAt" = now() WHERE "createdById" = $1 AND "revokedAt" IS NULL`,
        [userId],
      );
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: AuditAction.USER_UPDATE,
      resourceType: 'User',
      resourceId: userId,
      resourceName: user.email,
      metadata: { event: 'suspended', sessionsRevoked: true, shareLinksRevoked: true },
    });

    return { suspended: true };
  }

  async reinstate(actor: AuthUser, userId: string) {
    const user = await this.requireInOrg(actor, userId);
    await this.assertSeatAvailable(actor.organizationId);

    await this.db.execute(
      `UPDATE users SET status = $1, "updatedAt" = now() WHERE id = $2`,
      [user.passwordHash ? UserStatus.ACTIVE : UserStatus.INVITED, userId],
    );

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: AuditAction.USER_UPDATE,
      resourceType: 'User',
      resourceId: userId,
      resourceName: user.email,
      metadata: { event: 'reinstated' },
    });

    return { reinstated: true };
  }

  async listRoles(user: AuthUser) {
    return this.db.query(
      `SELECT r.*, json_build_object('users', count(ur."userId")) AS "_count"
         FROM roles r
         LEFT JOIN user_roles ur ON ur."roleId" = r.id
        WHERE r."organizationId" = $1
        GROUP BY r.id
        ORDER BY r.name ASC`,
      [user.organizationId],
    );
  }

  // ---------------------------------------------------------------------------

  private async findByInviteToken(token: string) {
    const user = await this.db.maybeOne<
      User & { organizationName: string; organizationStatus: OrgStatus }
    >(
      `SELECT u.*, o.name AS "organizationName", o.status AS "organizationStatus"
         FROM users u
         JOIN organizations o ON o.id = u."organizationId"
        WHERE u."inviteTokenHash" = $1 AND u."deletedAt" IS NULL`,
      [this.hashToken(token)],
    );

    // One message for every failure mode: a probe must not learn whether a
    // token existed, only expired, or belongs to a suspended tenant.
    const invalid = new NotFoundException('This invitation is no longer valid. Ask for a new one.');

    if (!user) throw invalid;
    if (!user.inviteExpiresAt || user.inviteExpiresAt < new Date()) throw invalid;
    if (user.status !== UserStatus.INVITED) throw invalid;
    if (
      user.organizationStatus === OrgStatus.SUSPENDED ||
      user.organizationStatus === OrgStatus.CLOSED
    ) {
      throw invalid;
    }

    return user;
  }

  private async requireInOrg(actor: AuthUser, userId: string): Promise<User> {
    const user = await this.db.maybeOne<User>(
      `SELECT * FROM users WHERE id = $1 AND "organizationId" = $2 AND "deletedAt" IS NULL`,
      [userId, actor.organizationId],
    );
    if (!user) throw new NotFoundException('No such person in this organisation');
    return user;
  }

  /**
   * Seats come from the signed subscription, not from `organizations.seatLimit`.
   *
   * On an on-premise install the client owns the database. Reading the limit
   * from a column would make enforcement a single UPDATE away from useless.
   */
  private async assertSeatAvailable(organizationId: string) {
    await this.license.assertSeatAvailable(organizationId);
  }

  private canGrantTier(actorTier: UserTier, target: UserTier): boolean {
    if (actorTier === UserTier.SYSTEM_ADMIN) return true;
    if (actorTier === UserTier.ORG_ADMIN) return target !== UserTier.SYSTEM_ADMIN;
    if (actorTier === UserTier.MANAGER) {
      const grantable: UserTier[] = [UserTier.CONTRIBUTOR, UserTier.VIEWER, UserTier.EXTERNAL];
      return grantable.includes(target);
    }
    return false;
  }

  private defaultRoleKey(tier: UserTier): string {
    return {
      [UserTier.SYSTEM_ADMIN]: 'system_admin',
      [UserTier.ORG_ADMIN]: 'org_admin',
      [UserTier.MANAGER]: 'manager',
      [UserTier.CONTRIBUTOR]: 'contributor',
      [UserTier.VIEWER]: 'viewer',
      [UserTier.EXTERNAL]: 'external',
    }[tier];
  }
}

/**
 * Turns a search term into a safe `ILIKE` pattern.
 *
 * Without escaping, a user typing `%` matches every row and `_` matches any
 * character — surprising for them, and a way to enumerate a directory.
 */
function contains(term: string): string {
  return `%${term.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}
