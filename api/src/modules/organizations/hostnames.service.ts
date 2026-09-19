import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { AuditAction, DatabaseService, newId, type TenantHostname } from '../../common/db';
import type { AuthUser } from '../../common/types/auth.types';
import { AuditService } from '../audit/audit.service';

/**
 * The web address a tenant reaches their records on.
 *
 * Distinct from OrganizationDomain, which is an *email* domain used to work out
 * who somebody is at sign-in. This one arrives on the Host header, decides
 * which tenant a request belongs to before anyone has authenticated, and needs
 * a TLS certificate rather than a DNS TXT record.
 *
 * Because it selects a tenant pre-authentication, an unverified hostname must
 * never resolve: otherwise anyone could point a domain at the platform and
 * make their own sign-in page look like a customer's.
 */
@Injectable()
export class HostnamesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser) {
    const items = await this.db.query<TenantHostname>(
      `SELECT * FROM tenant_hostnames
        WHERE "organizationId" = $1
        ORDER BY "isPrimary" DESC, hostname ASC`,
      [user.organizationId],
    );
    return { items, total: items.length };
  }

  async add(user: AuthUser, rawHostname: string) {
    const hostname = this.normalise(rawHostname);

    const taken = await this.db.maybeOne<{ id: string }>(
      `SELECT id FROM tenant_hostnames WHERE hostname = $1`,
      [hostname],
    );
    if (taken) {
      // Deliberately does not say which tenant holds it — that would let anyone
      // enumerate which companies are customers.
      throw new ConflictException('That hostname is already in use.');
    }

    const isFirst =
      (await this.db.count(`SELECT count(*) FROM tenant_hostnames WHERE "organizationId" = $1`, [
        user.organizationId,
      ])) === 0;

    const created = await this.db.one<TenantHostname>(
      `INSERT INTO tenant_hostnames (id, "organizationId", hostname, "verifyToken", "isPrimary", "createdAt")
            VALUES ($1, $2, $3, $4, false, now())
         RETURNING *`,
      // The first one becomes primary once verified; until then nothing is.
      [newId(), user.organizationId, hostname, `dossiro-site-verification=${randomBytes(16).toString('hex')}`],
    );

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.SETTINGS_CHANGE,
      resourceType: 'TenantHostname',
      resourceId: created.id,
      resourceName: hostname,
      metadata: { event: 'hostname_added' },
    });

    return {
      ...created,
      wouldBecomePrimary: isFirst,
      instructions: [
        `Add a DNS TXT record on ${hostname} with the value:`,
        created.verifyToken,
        `Then point ${hostname} at this deployment with a CNAME or A record, and verify.`,
      ],
    };
  }

  /**
   * Confirms ownership. In production this checks the DNS TXT record; here it
   * trusts the caller, who already holds SETTINGS_MANAGE on the tenant.
   */
  async verify(user: AuthUser, id: string) {
    const host = await this.require(user, id);
    if (host.verifiedAt) return host;

    // TODO(dns): resolve the TXT record and compare with verifyToken before
    // marking verified. Until that exists this is an administrator's assertion,
    // not proof, so it stays behind SETTINGS_MANAGE.
    const { verified, becamePrimary } = await this.db.transaction(async () => {
      // Counted inside the transaction: two hostnames verified at once would
      // otherwise both read zero and both claim primary.
      const isFirst =
        (await this.db.count(
          `SELECT count(*) FROM tenant_hostnames
            WHERE "organizationId" = $1 AND "verifiedAt" IS NOT NULL`,
          [user.organizationId],
        )) === 0;

      if (isFirst) {
        await this.db.execute(
          `UPDATE tenant_hostnames SET "isPrimary" = false
            WHERE "organizationId" = $1 AND "isPrimary" = true`,
          [user.organizationId],
        );
      }

      const row = await this.db.one<TenantHostname>(
        `UPDATE tenant_hostnames
            SET "verifiedAt" = now(), "isPrimary" = $1, "verifyToken" = NULL
          WHERE id = $2
      RETURNING *`,
        [isFirst, id],
      );

      return { verified: row, becamePrimary: isFirst };
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.SETTINGS_CHANGE,
      resourceType: 'TenantHostname',
      resourceId: id,
      resourceName: host.hostname,
      metadata: { event: 'hostname_verified', becamePrimary },
    });

    return verified;
  }

  /** The primary is what share links and invitation emails are built from. */
  async setPrimary(user: AuthUser, id: string) {
    const host = await this.require(user, id);

    if (!host.verifiedAt) {
      throw new BadRequestException(
        'Verify this hostname before making it primary — links built from an unverified address would not resolve.',
      );
    }

    // Demote-then-promote in one transaction: between the two statements a
    // tenant would momentarily have no primary at all, and anything building a
    // link in that window would silently fall back to the default address.
    await this.db.transaction(async () => {
      await this.db.execute(
        `UPDATE tenant_hostnames SET "isPrimary" = false
          WHERE "organizationId" = $1 AND "isPrimary" = true`,
        [user.organizationId],
      );
      await this.db.execute(`UPDATE tenant_hostnames SET "isPrimary" = true WHERE id = $1`, [id]);
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.SETTINGS_CHANGE,
      resourceType: 'TenantHostname',
      resourceId: id,
      resourceName: host.hostname,
      metadata: { event: 'hostname_primary' },
    });

    return { primary: host.hostname };
  }

  async remove(user: AuthUser, id: string) {
    const host = await this.require(user, id);

    const remaining = await this.db.count(
      `SELECT count(*) FROM tenant_hostnames
        WHERE "organizationId" = $1 AND "verifiedAt" IS NOT NULL AND id <> $2`,
      [user.organizationId, id],
    );
    if (host.isPrimary && remaining > 0) {
      throw new BadRequestException(
        'Make another hostname primary first, so links keep resolving to a working address.',
      );
    }

    await this.db.execute(`DELETE FROM tenant_hostnames WHERE id = $1`, [id]);

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.SETTINGS_CHANGE,
      resourceType: 'TenantHostname',
      resourceId: id,
      resourceName: host.hostname,
      metadata: { event: 'hostname_removed' },
    });

    return { removed: true };
  }

  /**
   * Which tenant does this request belong to?
   *
   * Only verified hostnames resolve. Returns just enough to brand a sign-in
   * page — never anything that would let a stranger probe a customer's data.
   */
  async resolveByHost(rawHost: string | undefined) {
    if (!rawHost) return null;

    // Resolving is a question, not a submission. `normalise` refuses anything
    // that would be invalid to REGISTER — including single-label hosts like
    // `localhost` or an internal LAN name — and throwing there turned "which
    // tenant is this?" into a 400 on every development machine. An
    // unrecognisable host simply belongs to no tenant.
    let hostname: string;
    try {
      hostname = this.normalise(rawHost);
    } catch {
      return null;
    }

    const match = await this.db.maybeOne<{
      id: string;
      name: string;
      slug: string;
      settings: Record<string, unknown> | null;
      status: string;
    }>(
      `SELECT o.id, o.name, o.slug, o.settings, o.status
         FROM tenant_hostnames h
         JOIN organizations o ON o.id = h."organizationId"
        WHERE h.hostname = $1 AND h."verifiedAt" IS NOT NULL
        LIMIT 1`,
      [hostname],
    );
    if (!match) return null;
    if (match.status === 'SUSPENDED' || match.status === 'CLOSED') return null;

    return {
      organizationId: match.id,
      name: match.name,
      slug: match.slug,
      /** Branding only: logo, colours. Never anything sensitive. */
      branding: match.settings?.branding ?? null,
    };
  }

  /** The address to build a tenant's share links and invitations from. */
  async primaryUrlFor(organizationId: string, fallback: string): Promise<string> {
    const primary = await this.db.maybeOne<{ hostname: string }>(
      `SELECT hostname FROM tenant_hostnames
        WHERE "organizationId" = $1 AND "isPrimary" = true AND "verifiedAt" IS NOT NULL
        LIMIT 1`,
      [organizationId],
    );
    return primary ? `https://${primary.hostname}` : fallback;
  }

  // ---------------------------------------------------------------------------

  private async require(user: AuthUser, id: string): Promise<TenantHostname> {
    const host = await this.db.maybeOne<TenantHostname>(
      `SELECT * FROM tenant_hostnames WHERE id = $1 AND "organizationId" = $2`,
      [id, user.organizationId],
    );
    if (!host) throw new NotFoundException('Hostname not found');
    return host;
  }

  private normalise(raw: string): string {
    const host = raw
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      // Strip the port: the Host header carries one in development.
      .split(':')[0];

    if (!host || !host.includes('.')) {
      throw new BadRequestException(`"${raw}" is not a valid hostname`);
    }
    if (!/^[a-z0-9.-]+$/.test(host)) {
      throw new BadRequestException('A hostname may only contain letters, numbers, dots and hyphens');
    }
    return host;
  }
}
