import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, DatabaseService, assignments, newId, type Branch } from '../../common/db';
import type { AuthUser } from '../../common/types/auth.types';
import { AuditService } from '../audit/audit.service';

/** Nesting ceiling. Zone → state → office is three; 12 is generous. */
const MAX_DEPTH = 12;

export interface CreateBranchInput {
  name: string;
  code?: string;
  parentId?: string | null;
  address?: string;
  phone?: string;
  timezone?: string;
  isHeadOffice?: boolean;
}

/**
 * Offices of a tenant.
 *
 * A branch answers "where is this person posted" and "whose cabinet is this",
 * which a Group cannot: groups are functional and you belong to several, a
 * branch is singular and geographic. Keeping them apart is what lets an
 * administrator say "Kano staff, read the Kano cabinet" in one grant.
 */
@Injectable()
export class BranchesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser) {
    const items = await this.db.query(
      `SELECT b.id, b.name, b.code, b.address, b.phone, b.timezone,
              b."isHeadOffice", b."createdAt",
              CASE WHEN p.id IS NULL THEN NULL
                   ELSE json_build_object('id', p.id, 'name', p.name) END AS parent,
              COALESCE(u.n, 0) AS people,
              COALESCE(f.n, 0) AS cabinets,
              COALESCE(c.n, 0) AS children
         FROM branches b
         LEFT JOIN branches p ON p.id = b."parentId"
         LEFT JOIN LATERAL (SELECT count(*) AS n FROM users
                             WHERE "branchId" = b.id AND "deletedAt" IS NULL) u ON TRUE
         LEFT JOIN LATERAL (SELECT count(*) AS n FROM folders
                             WHERE "branchId" = b.id AND "deletedAt" IS NULL) f ON TRUE
         LEFT JOIN LATERAL (SELECT count(*) AS n FROM branches
                             WHERE "parentId" = b.id AND "deletedAt" IS NULL) c ON TRUE
        WHERE b."organizationId" = $1 AND b."deletedAt" IS NULL
        ORDER BY b."isHeadOffice" DESC, b.name ASC`,
      [user.organizationId],
    );

    return { items, total: items.length };
  }

  /** Nested form, for a picker. */
  async tree(user: AuthUser) {
    const all = await this.db.query<Branch & { _count: { users: number } }>(
      `SELECT b.*, json_build_object('users', COALESCE(u.n, 0)) AS "_count"
         FROM branches b
         LEFT JOIN LATERAL (SELECT count(*) AS n FROM users
                             WHERE "branchId" = b.id AND "deletedAt" IS NULL) u ON TRUE
        WHERE b."organizationId" = $1 AND b."deletedAt" IS NULL
        ORDER BY b."isHeadOffice" DESC, b.name ASC`,
      [user.organizationId],
    );

    type Node = (typeof all)[number] & { children: Node[] };
    const byId = new Map<string, Node>(all.map((b) => [b.id, { ...b, children: [] }]));
    const roots: Node[] = [];

    for (const node of byId.values()) {
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async create(user: AuthUser, input: CreateBranchInput): Promise<Branch> {
    const name = this.normalise(input.name);

    const clash = await this.db.maybeOne<{ id: string }>(
      `SELECT id FROM branches
        WHERE "organizationId" = $1 AND name = $2 AND "deletedAt" IS NULL`,
      [user.organizationId, name],
    );
    if (clash) throw new ConflictException(`There is already a branch called "${name}"`);

    if (input.parentId) {
      const parent = await this.require(user, input.parentId);
      if ((await this.depthOf(parent.id)) + 1 > MAX_DEPTH) {
        throw new BadRequestException(`Branches cannot nest more than ${MAX_DEPTH} deep`);
      }
    }

    const branch = await this.db.transaction(async () => {
      // Exactly one head office. Two would make "the main branch" ambiguous in
      // every report that groups by it. Demotion and insert share a transaction
      // so a failure cannot leave the tenant with none at all.
      if (input.isHeadOffice) await this.clearHeadOffice(user.organizationId);

      return this.db.one<Branch>(
        `INSERT INTO branches (id, "organizationId", name, code, "parentId", address, phone,
                               timezone, "isHeadOffice", "createdAt", "updatedAt")
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())
           RETURNING *`,
        [
          newId(),
          user.organizationId,
          name,
          input.code?.trim().toUpperCase() || null,
          input.parentId ?? null,
          input.address ?? null,
          input.phone ?? null,
          input.timezone ?? 'Africa/Lagos',
          input.isHeadOffice ?? false,
        ],
      );
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.SETTINGS_CHANGE,
      resourceType: 'Branch',
      resourceId: branch.id,
      resourceName: branch.name,
      metadata: { event: 'branch_created', code: branch.code },
    });

    return branch;
  }

  async update(user: AuthUser, id: string, input: Partial<CreateBranchInput>): Promise<Branch> {
    const branch = await this.require(user, id);

    if (input.parentId !== undefined && input.parentId !== branch.parentId) {
      await this.assertMoveIsSafe(user, branch, input.parentId);
    }

    const patch: Record<string, unknown> = {
      ...(input.name !== undefined ? { name: this.normalise(input.name) } : {}),
      ...(input.code !== undefined ? { code: input.code?.trim().toUpperCase() || null } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
      ...(input.isHeadOffice !== undefined ? { isHeadOffice: input.isHeadOffice } : {}),
      updatedAt: new Date(),
    };

    const updated = await this.db.transaction(async () => {
      if (input.isHeadOffice) await this.clearHeadOffice(user.organizationId);

      const set = assignments(patch, 2);
      return this.db.one<Branch>(
        `UPDATE branches SET ${set.text} WHERE id = $1 RETURNING *`,
        [id, ...set.values],
      );
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.SETTINGS_CHANGE,
      resourceType: 'Branch',
      resourceId: id,
      resourceName: updated.name,
      changes: { from: branch.name, to: updated.name },
    });

    return updated;
  }

  /**
   * Closing an office never deletes its people or its records — the foreign
   * keys are ON DELETE SET NULL and this is a soft delete besides. Staff and
   * cabinets are simply unposted, ready to be reassigned.
   */
  async close(user: AuthUser, id: string) {
    const branch = await this.require(user, id);

    const children = await this.db.count(
      `SELECT count(*) FROM branches WHERE "parentId" = $1 AND "deletedAt" IS NULL`,
      [id],
    );
    if (children > 0) {
      throw new ConflictException(
        `${branch.name} has ${children} branch${children === 1 ? '' : 'es'} under it. Move or close those first.`,
      );
    }

    // Count and unpost in one transaction. Counting outside it would report a
    // number that had already changed by the time the UPDATE ran, and the audit
    // entry would record a figure that was never true.
    const { people, cabinets } = await this.db.transaction(async () => {
      const peopleCount = await this.db.count(
        `SELECT count(*) FROM users WHERE "branchId" = $1 AND "deletedAt" IS NULL`,
        [id],
      );
      const cabinetCount = await this.db.count(
        `SELECT count(*) FROM folders WHERE "branchId" = $1 AND "deletedAt" IS NULL`,
        [id],
      );

      await this.db.execute(
        `UPDATE branches SET "deletedAt" = now(), "updatedAt" = now() WHERE id = $1`,
        [id],
      );
      await this.db.execute(`UPDATE users SET "branchId" = NULL WHERE "branchId" = $1`, [id]);
      await this.db.execute(`UPDATE folders SET "branchId" = NULL WHERE "branchId" = $1`, [id]);

      return { people: peopleCount, cabinets: cabinetCount };
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.SETTINGS_CHANGE,
      resourceType: 'Branch',
      resourceId: id,
      resourceName: branch.name,
      metadata: { event: 'branch_closed', peopleUnposted: people, cabinetsUnposted: cabinets },
    });

    return { closed: true, peopleUnposted: people, cabinetsUnposted: cabinets };
  }

  /** Posts someone to a branch, or unposts them with null. */
  async assignUser(user: AuthUser, userId: string, branchId: string | null) {
    const target = await this.db.maybeOne<{ id: string; email: string }>(
      `SELECT id, email FROM users
        WHERE id = $1 AND "organizationId" = $2 AND "deletedAt" IS NULL`,
      [userId, user.organizationId],
    );
    if (!target) throw new NotFoundException('No such person in this organisation');

    if (branchId) await this.require(user, branchId);

    const updated = await this.db.one(
      `UPDATE users SET "branchId" = $1, "updatedAt" = now()
        WHERE id = $2
    RETURNING id, email, "displayName", "branchId",
              (SELECT CASE WHEN b.id IS NULL THEN NULL
                           ELSE json_build_object('id', b.id, 'name', b.name) END
                 FROM branches b WHERE b.id = $1) AS branch`,
      [branchId, userId],
    );

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.USER_UPDATE,
      resourceType: 'User',
      resourceId: userId,
      resourceName: target.email,
      metadata: { event: 'branch_assigned', branchId },
    });

    return updated;
  }

  // ---------------------------------------------------------------------------

  private async require(user: AuthUser, id: string): Promise<Branch> {
    const branch = await this.db.maybeOne<Branch>(
      `SELECT * FROM branches
        WHERE id = $1 AND "organizationId" = $2 AND "deletedAt" IS NULL`,
      [id, user.organizationId],
    );
    if (!branch) throw new NotFoundException('Branch not found');
    return branch;
  }

  private async clearHeadOffice(organizationId: string) {
    await this.db.execute(
      `UPDATE branches SET "isHeadOffice" = false
        WHERE "organizationId" = $1 AND "isHeadOffice" = true`,
      [organizationId],
    );
  }

  /**
   * How many levels sit above this branch.
   *
   * One recursive query rather than a read per level. `CYCLE` stops a corrupted
   * parent chain from looping — the old version relied on a counter for that,
   * which capped the damage but still walked the cycle.
   */
  private async depthOf(id: string): Promise<number> {
    const rows = await this.db.query<{ id: string }>(
      `WITH RECURSIVE chain AS (
            SELECT id, "parentId" FROM branches WHERE id = $1
             UNION ALL
            SELECT b.id, b."parentId"
              FROM branches b
              JOIN chain c ON b.id = c."parentId"
          ) CYCLE id SET looped USING trail
        SELECT id FROM chain`,
      [id],
    );
    // The branch itself is in the result, so its own row is not a level above.
    return Math.max(rows.length - 1, 0);
  }

  /** A branch cannot become its own ancestor, which would orphan the subtree. */
  private async assertMoveIsSafe(user: AuthUser, branch: Branch, newParentId: string | null) {
    if (!newParentId) return;
    if (newParentId === branch.id) {
      throw new BadRequestException('A branch cannot be its own parent');
    }

    await this.require(user, newParentId);

    const ancestors = await this.db.query<{ id: string }>(
      `WITH RECURSIVE chain AS (
            SELECT id, "parentId" FROM branches WHERE id = $1
             UNION ALL
            SELECT b.id, b."parentId"
              FROM branches b
              JOIN chain c ON b.id = c."parentId"
          ) CYCLE id SET looped USING trail
        SELECT id FROM chain`,
      [newParentId],
    );

    if (ancestors.some((a) => a.id === branch.id)) {
      throw new BadRequestException('That would move the branch inside one of its own branches');
    }
  }

  private normalise(raw: string): string {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (!name) throw new BadRequestException('A branch needs a name');
    if (name.length > 120) throw new BadRequestException('Branch name is too long (max 120)');
    return name;
  }
}
