import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { DatabaseService, newId } from '../../common/db';
import {
  AuditAction,
  OrgStatus,
  UserStatus,
  UserTier,
  type Organization,
  type OrganizationDomain,
  type User,
} from '../../common/db';
import { LicenseService } from '../../common/licensing/license.service';
import { SYSTEM_ROLES } from '../../common/rbac/permissions';
import { AuditService, type JsonValue } from '../audit/audit.service';
import { UsersService } from '../users/users.service';

/**
 * Tenant lifecycle.
 *
 * Calm Global runs one deployment and provisions a tenant per client company
 * after a sale. There is no self-serve signup: the design enforces single
 * sign-on, and enterprise records buyers arrive through procurement, migration
 * and a folder-structure conversation, not a credit card.
 */

/** Domains nobody may claim — registering one would hand strangers a route in. */
const PUBLIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com',
  'outlook.com', 'live.com', 'msn.com', 'icloud.com', 'me.com', 'aol.com',
  'proton.me', 'protonmail.com', 'gmx.com', 'yandex.com', 'mail.com',
  'zoho.com', 'qq.com', '163.com',
]);

export interface ProvisionInput {
  name: string;
  slug?: string;
  /** Email of the first administrator. They receive the invitation. */
  ownerEmail: string;
  ownerName: string;
  /** Verified email domains that resolve to this tenant at sign-in. */
  domains?: string[];
  plan?: string;
  seatLimit?: number;
  region?: string;
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly license: LicenseService,
  ) {}

  /**
   * Records a platform action in two places.
   *
   * The customer's trail, so they can see who provisioned or suspended them —
   * their auditor will ask. And the platform organisation's own trail, so Calm
   * Global has one consolidated record of what its operators did across every
   * tenant. Neither view is complete on its own.
   */
  private async auditPlatformAction(input: {
    tenantId: string;
    tenantName: string;
    actorId?: string;
    actorLabel: string;
    metadata: Record<string, unknown>;
  }) {
    const entry = {
      action: AuditAction.SETTINGS_CHANGE,
      resourceType: 'Organization',
      resourceId: input.tenantId,
      resourceName: input.tenantName,
      actorId: input.actorId ?? null,
      actorLabel: input.actorLabel,
      metadata: input.metadata as JsonValue,
    };

    await this.audit.record({ ...entry, organizationId: input.tenantId });

    const platform = await this.db.maybeOne<{ id: string }>(
      `SELECT id FROM organizations WHERE "isPlatform" = true LIMIT 1`,
    );
    if (platform && platform.id !== input.tenantId) {
      await this.audit.record({ ...entry, organizationId: platform.id });
    }
  }

  /**
   * Creates a tenant, seeds its roles, and invites its first administrator.
   *
   * All of it in one transaction: a half-provisioned tenant with no owner is
   * unreachable, and nobody would be able to finish it.
   */
  async provision(input: ProvisionInput, actorLabel: string, actor?: { id: string }) {
    const slug = this.normaliseSlug(input.slug ?? input.name);
    const ownerEmail = input.ownerEmail.trim().toLowerCase();

    if (!ownerEmail.includes('@')) throw new BadRequestException('A valid owner email is required');

    const clash = await this.db.maybeOne<{ id: string }>(
      `SELECT id FROM organizations WHERE slug = $1`,
      [slug],
    );
    if (clash) throw new ConflictException(`An organisation with the slug "${slug}" already exists`);

    const domains = (input.domains ?? []).map((d) => this.normaliseDomain(d));
    for (const domain of domains) {
      if (PUBLIC_DOMAINS.has(domain)) {
        throw new BadRequestException(
          `"${domain}" is a public email provider and cannot be claimed by a tenant. Invite those users individually instead.`,
        );
      }
      const taken = await this.db.maybeOne<{ id: string }>(
        `SELECT id FROM organization_domains WHERE domain = $1`,
        [domain],
      );
      if (taken) throw new ConflictException(`The domain "${domain}" already belongs to another organisation`);
    }

    const { organization, owner, inviteToken } = await this.db.transaction(async () => {
      const org = await this.db.one<Organization>(
        `INSERT INTO organizations (id, name, slug, plan, "seatLimit", region, status, "createdAt", "updatedAt")
              VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
           RETURNING *`,
        [
          newId(),
          input.name.trim(),
          slug,
          input.plan ?? 'standard',
          input.seatLimit ?? null,
          // Lagos unless asked otherwise in writing. The contract's residency
          // clause promises Nigeria, so the default has to match it (NFR-5).
          input.region ?? 'ng-lagos-1',
          OrgStatus.TRIAL,
        ],
      );

      for (const domain of domains) {
        await this.db.execute(
          `INSERT INTO organization_domains (id, "organizationId", domain, "verifiedAt", "createdAt")
                VALUES ($1, $2, $3, now(), now())`,
          // Provisioned by staff, so treated as verified at creation.
          [newId(), org.id, domain],
        );
      }

      // Every tenant gets its own copy of the system roles, so an org admin can
      // edit permissions for their own people without touching another tenant.
      for (const [key, role] of Object.entries(SYSTEM_ROLES)) {
        await this.db.execute(
          `INSERT INTO roles (id, "organizationId", key, name, description, "isSystem", permissions,
                              "createdAt", "updatedAt")
                VALUES ($1, $2, $3, $4, $5, true, $6, now(), now())`,
          [newId(), org.id, key, role.name, role.description, role.permissions as string[]],
        );
      }

      const adminRole = await this.db.one<{ id: string }>(
        `SELECT id FROM roles WHERE "organizationId" = $1 AND key = 'org_admin'`,
        [org.id],
      );

      const token = randomBytes(32).toString('base64url');
      const user = await this.db.one<User>(
        `INSERT INTO users (id, "organizationId", email, "displayName", tier, status,
                            "inviteTokenHash", "inviteExpiresAt", "invitedAt", "createdAt", "updatedAt")
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now(), now())
           RETURNING *`,
        [
          newId(),
          org.id,
          ownerEmail,
          input.ownerName.trim(),
          UserTier.ORG_ADMIN,
          UserStatus.INVITED,
          this.users.hashToken(token),
          new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        ],
      );

      await this.db.execute(
        `INSERT INTO user_roles (id, "userId", "roleId", "assignedAt") VALUES ($1, $2, $3, now())`,
        [newId(), user.id, adminRole.id],
      );

      return { organization: org, owner: user, inviteToken: token };
    });

    const delivery = await this.users
      .sendOwnerInvitation({
        to: ownerEmail,
        displayName: owner.displayName,
        organizationName: organization.name,
        token: inviteToken,
        expiresAt: owner.inviteExpiresAt,
      })
      .catch(() => 'failed' as const);

    await this.auditPlatformAction({
      tenantId: organization.id,
      tenantName: organization.name,
      actorId: actor?.id,
      actorLabel,
      metadata: { event: 'tenant_provisioned', ownerEmail, domains, delivery },
    });

    return {
      organization,
      owner: { id: owner.id, email: owner.email, displayName: owner.displayName },
      // Returned once, so an operator can hand the link over directly when mail
      // is not configured. Only the hash is stored.
      inviteToken,
      inviteUrl: this.users.inviteUrl(inviteToken),
      delivery,
    };
  }

  /**
   * What a tenant's own deployment concludes about its licence.
   *
   * Delegated to the licence service rather than read off the organisation
   * row, because the row is not the authority — the signed payload is. An
   * operator looking at a seat count in this console should be looking at the
   * same number the customer's installation enforces (PLT-5).
   */
  async licenseFor(organizationId: string) {
    const org = await this.db.maybeOne<{ id: string; name: string; region: string | null }>(
      'SELECT id, name, region FROM organizations WHERE id = $1',
      [organizationId],
    );
    if (!org) throw new NotFoundException('No such tenant.');

    const status = await this.license.statusFor(organizationId);
    return { organizationId: org.id, organizationName: org.name, region: org.region, ...status };
  }

  /** Everyone on the platform side, with what they can do. */
  async operators() {
    const items = await this.db.query(
      `SELECT u.id, u."displayName", u.email, u.tier, u.status, u."lastLoginAt", u."mfaEnabled",
              COALESCE(
                (SELECT json_agg(r.name ORDER BY r.name)
                   FROM user_roles ur JOIN roles r ON r.id = ur."roleId"
                  WHERE ur."userId" = u.id),
                '[]'::json
              ) AS roles
         FROM users u
         JOIN organizations o ON o.id = u."organizationId"
        WHERE o."isPlatform" = true AND u."deletedAt" IS NULL
        ORDER BY u."displayName" ASC`,
    );
    return { items, total: items.length };
  }

  async list() {
    return this.db.query(
      `SELECT o.id, o.name, o.slug, o."isPlatform", o.status, o.plan, o."seatLimit", o.region,
              o."createdAt",
              COALESCE(u.seats, 0) AS "seatsUsed",
              COALESCE(d.docs, 0)  AS documents,
              COALESCE(dom.domains, '[]'::json) AS domains
         FROM organizations o
         LEFT JOIN LATERAL (SELECT count(*) AS seats FROM users
                             WHERE "organizationId" = o.id) u ON TRUE
         LEFT JOIN LATERAL (SELECT count(*) AS docs FROM documents
                             WHERE "organizationId" = o.id) d ON TRUE
         LEFT JOIN LATERAL (
                SELECT json_agg(json_build_object('domain', od.domain, 'verifiedAt', od."verifiedAt")) AS domains
                  FROM organization_domains od
                 WHERE od."organizationId" = o.id
              ) dom ON TRUE
        ORDER BY o."createdAt" DESC`,
    );
  }

  async current(organizationId: string) {
    const org = await this.db.maybeOne(
      `SELECT o.*,
              COALESCE(u.seats, 0) AS "seatsUsed",
              COALESCE(dom.domains, '[]'::json) AS domains
         FROM organizations o
         LEFT JOIN LATERAL (SELECT count(*) AS seats FROM users
                             WHERE "organizationId" = o.id) u ON TRUE
         LEFT JOIN LATERAL (
                SELECT json_agg(json_build_object('domain', od.domain, 'verifiedAt', od."verifiedAt")) AS domains
                  FROM organization_domains od
                 WHERE od."organizationId" = o.id
              ) dom ON TRUE
        WHERE o.id = $1`,
      [organizationId],
    );
    if (!org) throw new NotFoundException('Organisation not found');
    return org;
  }

  /** Branding and tenant-wide defaults. White-labelling lives in settings. */
  async updateSettings(organizationId: string, settings: JsonValue, actorId: string) {
    const updated = await this.db.one<Organization>(
      `UPDATE organizations SET settings = $1, "updatedAt" = now() WHERE id = $2 RETURNING *`,
      [JSON.stringify(settings), organizationId],
    );

    await this.audit.record({
      organizationId,
      actorId,
      action: AuditAction.SETTINGS_CHANGE,
      resourceType: 'Organization',
      resourceId: organizationId,
      resourceName: updated.name,
    });

    return updated;
  }

  /**
   * Suspending a tenant stops every sign-in immediately by revoking sessions.
   * Documents are untouched — suspension is a commercial state, not a delete.
   */
  async setStatus(input: {
    organizationId: string;
    status: OrgStatus;
    actorLabel: string;
    actor?: { id: string };
    reason?: string;
  }) {
    const { organizationId, status, actorLabel, actor } = input;
    const reason = input.reason?.trim() || undefined;

    const target = await this.db.maybeOne<{ isPlatform: boolean; name: string; status: OrgStatus }>(
      `SELECT "isPlatform", name, status FROM organizations WHERE id = $1`,
      [organizationId],
    );
    if (!target) throw new NotFoundException('Organisation not found');

    // Suspending the platform organisation would lock every operator out of
    // tenant administration, with only the bootstrap key left to recover.
    if (target.isPlatform && status !== OrgStatus.ACTIVE) {
      throw new BadRequestException('The platform organisation cannot be suspended or closed.');
    }

    const cutsOffAccess = status === OrgStatus.SUSPENDED || status === OrgStatus.CLOSED;

    // Locking a whole organisation out of its own records is the heaviest thing
    // an operator can do. "Who and when" without "why" leaves whoever picks up
    // the dispute six months later with a decision they cannot account for, so
    // the reason is a precondition rather than an optional note. Restoring
    // access needs no defence, so ACTIVE does not demand one.
    if (cutsOffAccess && !reason) {
      throw new BadRequestException(
        `Say why "${target.name}" is being ${status === OrgStatus.SUSPENDED ? 'suspended' : 'closed'}. It revokes every session in the organisation and the reason goes on the permanent record.`,
      );
    }

    // The status change and the session revocation are one unit: a suspended
    // tenant whose sessions survived is still signed in.
    const org = await this.db.transaction(async () => {
      const updated = await this.db.one<Organization>(
        `UPDATE organizations SET status = $1, "updatedAt" = now() WHERE id = $2 RETURNING *`,
        [status, organizationId],
      );

      if (cutsOffAccess) {
        await this.db.execute(
          `UPDATE sessions s
              SET "revokedAt" = now()
             FROM users u
            WHERE u.id = s."userId"
              AND u."organizationId" = $1
              AND s."revokedAt" IS NULL`,
          [organizationId],
        );
      }

      return updated;
    });

    await this.auditPlatformAction({
      tenantId: organizationId,
      tenantName: org.name,
      actorId: actor?.id,
      actorLabel,
      // From and to, not just to: "suspended" reads very differently depending
      // on whether the tenant was active or already closed.
      metadata: {
        event: 'status_changed',
        from: target.status,
        status,
        ...(reason ? { reason } : {}),
      },
    });

    return org;
  }

  async addDomain(organizationId: string, rawDomain: string, actorId: string) {
    const domain = this.normaliseDomain(rawDomain);

    if (PUBLIC_DOMAINS.has(domain)) {
      throw new BadRequestException(
        `"${domain}" is a public email provider and cannot be claimed. Invite those users individually.`,
      );
    }
    const taken = await this.db.maybeOne<{ id: string }>(
      `SELECT id FROM organization_domains WHERE domain = $1`,
      [domain],
    );
    if (taken) throw new ConflictException('That domain already belongs to an organisation');

    const created = await this.db.one<OrganizationDomain>(
      `INSERT INTO organization_domains (id, "organizationId", domain, "verifyToken", "createdAt")
            VALUES ($1, $2, $3, $4, now())
         RETURNING *`,
      // Self-service additions must prove ownership before they resolve.
      [newId(), organizationId, domain, `dossiro-verify=${randomBytes(16).toString('hex')}`],
    );

    await this.audit.record({
      organizationId,
      actorId,
      action: AuditAction.SETTINGS_CHANGE,
      resourceType: 'OrganizationDomain',
      resourceId: created.id,
      resourceName: domain,
    });

    return {
      ...created,
      instructions: `Add a DNS TXT record on ${domain} with the value "${created.verifyToken}", then verify.`,
    };
  }

  // ---------------------------------------------------------------------------

  private normaliseSlug(raw: string): string {
    const slug = raw
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
    if (!slug) throw new BadRequestException('Could not derive a slug from that name');
    return slug;
  }

  private normaliseDomain(raw: string): string {
    const domain = raw.trim().toLowerCase().replace(/^@/, '').replace(/^https?:\/\//, '').split('/')[0];
    if (!domain || !domain.includes('.')) throw new BadRequestException(`"${raw}" is not a valid domain`);
    return domain;
  }
}
