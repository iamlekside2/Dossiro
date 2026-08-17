import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService, Params } from '../../common/db';
import { AccessLevel, SubjectType, UserTier, type AccessGrant } from '../../common/db';
import { levelSatisfies, strongestLevel } from '../../common/rbac/permissions';
import type { AuthUser } from '../../common/types/auth.types';

/**
 * Resolves "what may this user do with this object?".
 *
 * Resolution is by SPECIFICITY, most specific scope first:
 *
 *   1. the document itself
 *   2. its folder
 *   3. that folder's parent, and so on up to the root
 *
 * The first scope that has any grant matching the user decides the outcome,
 * and a DENY at that scope beats every ALLOW at the same scope. Scopes above
 * are then not consulted. That is what lets an administrator open up a whole
 * department and still carve one folder back out.
 *
 * A folder with `inheritAccess = false` stops the walk, so a sensitive subtree
 * can be isolated from whatever is granted above it.
 */
@Injectable()
export class AccessService {
  constructor(private readonly db: DatabaseService) {}

  /** Effective level for a user on a document. */
  async getDocumentAccess(user: AuthUser, documentId: string): Promise<AccessLevel> {
    const doc = await this.db.maybeOne<{ id: string; ownerId: string | null; folderId: string | null }>(
      `SELECT id, "ownerId", "folderId"
         FROM documents
        WHERE id = $1 AND "organizationId" = $2`,
      [documentId, user.organizationId],
    );
    if (!doc) throw new NotFoundException('Document not found');

    const adminLevel = this.adminOverride(user);
    if (adminLevel) return adminLevel;

    if (doc.ownerId && doc.ownerId === user.id) return AccessLevel.OWNER;

    // Scope 1: grants attached directly to the document.
    const p = new Params();
    const directGrants = await this.db.query<AccessGrant>(
      `SELECT * FROM access_grants g
        WHERE g."documentId" = ${p.add(doc.id)}
          AND ${this.subjectCondition(user, p)}
          AND ${NOT_EXPIRED}`,
      p.values,
    );

    const direct = this.resolveScope(directGrants);
    if (direct !== null) return direct;

    // Scopes 2..n: the folder chain.
    if (!doc.folderId) return AccessLevel.NONE;
    return this.resolveFolderChain(user, doc.folderId);
  }

  /** Effective level for a user on a folder. */
  async getFolderAccess(user: AuthUser, folderId: string): Promise<AccessLevel> {
    const adminLevel = this.adminOverride(user);
    if (adminLevel) return adminLevel;
    return this.resolveFolderChain(user, folderId);
  }

  /** Throws unless the user has at least `required` on the document. */
  async assertDocument(user: AuthUser, documentId: string, required: AccessLevel): Promise<AccessLevel> {
    const actual = await this.getDocumentAccess(user, documentId);
    if (!levelSatisfies(actual, required)) {
      throw new ForbiddenException(`Requires ${required} access to this document (you have ${actual}).`);
    }
    return actual;
  }

  /** Throws unless the user has at least `required` on the folder. */
  async assertFolder(user: AuthUser, folderId: string, required: AccessLevel): Promise<AccessLevel> {
    const actual = await this.getFolderAccess(user, folderId);
    if (!levelSatisfies(actual, required)) {
      throw new ForbiddenException(`Requires ${required} access to this folder (you have ${actual}).`);
    }
    return actual;
  }

  /**
   * Ids of every folder the user can at least read. Used to constrain search
   * so results never reveal the existence of documents the user cannot see.
   *
   * Returns null for administrators, meaning "no restriction".
   */
  async readableFolderIds(user: AuthUser): Promise<string[] | null> {
    if (this.adminOverride(user)) return null;

    const p = new Params();
    const grants = await this.db.query<{ folderId: string }>(
      `SELECT DISTINCT g."folderId"
         FROM access_grants g
        WHERE g."folderId" IS NOT NULL
          AND g."isDeny" = false
          AND ${this.subjectCondition(user, p)}
          AND ${NOT_EXPIRED}`,
      p.values,
    );

    const rootIds = grants.map((g) => g.folderId);
    if (rootIds.length === 0) return [];

    // Expand each granted folder to its whole subtree via the materialised
    // path. `starts_with` rather than LIKE: a path is data, and LIKE would read
    // any _ or % inside it as a wildcard.
    const q = new Params();
    const rows = await this.db.query<{ id: string }>(
      `SELECT f.id
         FROM folders f
         JOIN folders root
           ON root.id = ANY(${q.add(rootIds)}::text[])
          AND root."organizationId" = f."organizationId"
        WHERE f."organizationId" = ${q.add(user.organizationId)}
          AND f."deletedAt" IS NULL
          AND starts_with(f.path, root.path)`,
      q.values,
    );

    return [...new Set([...rootIds, ...rows.map((r) => r.id)])];
  }

  // ---------------------------------------------------------------------------

  private async resolveFolderChain(user: AuthUser, folderId: string): Promise<AccessLevel> {
    const folder = await this.db.maybeOne<{ id: string; path: string }>(
      `SELECT id, path FROM folders WHERE id = $1 AND "organizationId" = $2`,
      [folderId, user.organizationId],
    );
    if (!folder) throw new NotFoundException('Folder not found');

    // path is "/rootId/childId/leafId/" - deepest last.
    const chain = folder.path.split('/').filter(Boolean);
    if (!chain.includes(folder.id)) chain.push(folder.id);

    const folders = await this.db.query<{ id: string; inheritAccess: boolean }>(
      `SELECT id, "inheritAccess" FROM folders WHERE id = ANY($1::text[])`,
      [chain],
    );
    const inheritById = new Map(folders.map((f) => [f.id, f.inheritAccess]));

    const p = new Params();
    const grants = await this.db.query<AccessGrant>(
      `SELECT * FROM access_grants g
        WHERE g."folderId" = ANY(${p.add(chain)}::text[])
          AND ${this.subjectCondition(user, p)}
          AND ${NOT_EXPIRED}`,
      p.values,
    );

    const byFolder = new Map<string, AccessGrant[]>();
    for (const g of grants) {
      if (!g.folderId) continue;
      const list = byFolder.get(g.folderId) ?? [];
      list.push(g);
      byFolder.set(g.folderId, list);
    }

    // Walk deepest -> shallowest.
    for (let i = chain.length - 1; i >= 0; i--) {
      const id = chain[i];
      const resolved = this.resolveScope(byFolder.get(id) ?? []);
      if (resolved !== null) return resolved;

      // This folder is isolated: do not consult its ancestors.
      if (inheritById.get(id) === false) return AccessLevel.NONE;
    }

    return AccessLevel.NONE;
  }

  /**
   * Decides one scope. Returns null when the scope is silent, so the caller
   * knows to keep walking up rather than treating it as an explicit refusal.
   */
  private resolveScope(grants: AccessGrant[]): AccessLevel | null {
    if (grants.length === 0) return null;
    if (grants.some((g) => g.isDeny)) return AccessLevel.NONE;
    return strongestLevel(grants.map((g) => g.level));
  }

  /**
   * The grant is addressed to this user, one of their groups, one of their
   * roles, or a branch they sit under.
   *
   * Emitted as one parenthesised OR group. Without the parentheses it would
   * bind loosely against the surrounding ANDs and a grant to any group would
   * match any document.
   */
  private subjectCondition(user: AuthUser, p: Params): string {
    const clauses = [`(g."subjectType" = '${SubjectType.USER}' AND g."userId" = ${p.add(user.id)})`];

    if (user.groupIds.length) {
      clauses.push(
        `(g."subjectType" = '${SubjectType.GROUP}' AND g."groupId" = ANY(${p.add(user.groupIds)}::text[]))`,
      );
    }
    if (user.roleIds.length) {
      clauses.push(
        `(g."subjectType" = '${SubjectType.ROLE}' AND g."roleId" = ANY(${p.add(user.roleIds)}::text[]))`,
      );
    }
    // Where you are posted. Includes the branches above yours, so a grant to
    // "North West zone" reaches someone posted to the Kano office inside it.
    if (user.branchIds.length) {
      clauses.push(
        `(g."subjectType" = '${SubjectType.BRANCH}' AND g."branchId" = ANY(${p.add(user.branchIds)}::text[]))`,
      );
    }

    return `(${clauses.join(' OR ')})`;
  }

  private adminOverride(user: AuthUser): AccessLevel | null {
    if (user.tier === UserTier.SYSTEM_ADMIN) return AccessLevel.OWNER;
    if (user.tier === UserTier.ORG_ADMIN) return AccessLevel.MANAGE;
    return null;
  }
}

/**
 * A grant is live when it has no expiry at all, or its expiry is still in the
 * future. `now()` is the transaction's clock, so a long request cannot have
 * one grant expire midway through resolving a single decision.
 */
const NOT_EXPIRED = `(g."expiresAt" IS NULL OR g."expiresAt" >= now())`;
