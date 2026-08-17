import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AccessLevel,
  AuditAction,
  Classification,
  DatabaseService,
  newId,
  type Folder,
} from '../../common/db';
import type { AuthUser } from '../../common/types/auth.types';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';

/** Hard ceiling on nesting. "Infinite" subfolders in practice means "deep
 *  enough that nobody hits it", not "unbounded" - an unbounded tree turns one
 *  bad move operation into an unrecoverable cycle. */
const MAX_DEPTH = 64;

export interface CreateFolderInput {
  name: string;
  parentId?: string | null;
  classification?: Classification;
  description?: string;
  inheritAccess?: boolean;
}

@Injectable()
export class FoldersService {
  constructor(
    private readonly db: DatabaseService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  async create(user: AuthUser, input: CreateFolderInput): Promise<Folder> {
    if (user.isPlatform) {
      throw new ForbiddenException(
        'The platform organisation administers tenants and does not hold folders.',
      );
    }

    const name = this.normaliseName(input.name);

    let parent: Folder | null = null;
    if (input.parentId) {
      parent = await this.db.maybeOne<Folder>(
        `SELECT * FROM folders
          WHERE id = $1 AND "organizationId" = $2 AND "deletedAt" IS NULL`,
        [input.parentId, user.organizationId],
      );
      if (!parent) throw new NotFoundException('Parent folder not found');
      await this.access.assertFolder(user, parent.id, AccessLevel.WRITE);

      if (parent.depth + 1 > MAX_DEPTH) {
        throw new BadRequestException(`Folder nesting limit of ${MAX_DEPTH} reached`);
      }
    }

    const duplicate = await this.db.maybeOne<{ id: string }>(
      `SELECT id FROM folders
        WHERE "organizationId" = $1
          AND "parentId" IS NOT DISTINCT FROM $2
          AND name = $3
          AND "deletedAt" IS NULL`,
      // IS NOT DISTINCT FROM, not `=`: a root folder's parentId is NULL, and
      // `NULL = NULL` is unknown, so `=` would never find an existing root.
      [user.organizationId, input.parentId ?? null, name],
    );
    if (duplicate) throw new BadRequestException(`A folder named "${name}" already exists here`);

    // A child never sits below its parent's sensitivity. Silently inheriting a
    // weaker label is how RESTRICTED content ends up in an INTERNAL subtree.
    const classification = input.classification ?? parent?.classification ?? Classification.INTERNAL;

    // The id is generated up front, so the materialised path can be written in
    // the INSERT itself rather than by a second UPDATE.
    const id = newId();
    const path = `${parent ? parent.path : '/'}${id}/`;

    const folder = await this.db.one<Folder>(
      `INSERT INTO folders (id, "organizationId", name, "parentId", depth, path, classification,
                            description, "inheritAccess", "createdById", "createdAt", "updatedAt")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), now())
         RETURNING *`,
      // The path includes the folder's own id and always ends in a slash, so a
      // prefix match selects the subtree and never a sibling whose id happens
      // to share a prefix.
      [
        id,
        user.organizationId,
        name,
        parent?.id ?? null,
        parent ? parent.depth + 1 : 0,
        path,
        classification,
        input.description ?? null,
        input.inheritAccess ?? true,
        user.id,
      ],
    );

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.FOLDER_CREATE,
      resourceType: 'Folder',
      resourceId: folder.id,
      resourceName: folder.name,
    });

    return folder;
  }

  /** Direct children, filtered to what the user may actually see. */
  async children(user: AuthUser, parentId: string | null) {
    if (parentId) await this.access.assertFolder(user, parentId, AccessLevel.READ);

    const folders = await this.db.query<Folder>(
      `SELECT * FROM folders
        WHERE "organizationId" = $1
          AND "parentId" IS NOT DISTINCT FROM $2
          AND "deletedAt" IS NULL
        ORDER BY name ASC`,
      [user.organizationId, parentId],
    );

    const visible = await this.filterReadable(user, folders);

    const documents = await this.db.query(
      `SELECT d.*,
              CASE WHEN v.id IS NULL THEN NULL ELSE
                json_build_object('sizeBytes', v."sizeBytes", 'versionNumber', v."versionNumber")
              END AS "currentVersion"
         FROM documents d
         LEFT JOIN document_versions v ON v.id = d."currentVersionId"
        WHERE d."organizationId" = $1
          AND d."folderId" IS NOT DISTINCT FROM $2
          AND d."deletedAt" IS NULL
        ORDER BY d."updatedAt" DESC`,
      [user.organizationId, parentId],
    );

    return { folders: visible, documents };
  }

  /** Whole subtree as a nested structure, pruned to readable branches. */
  async tree(user: AuthUser, rootId?: string) {
    const scope = rootId
      ? await this.db.maybeOne<Folder>(
          `SELECT * FROM folders
            WHERE id = $1 AND "organizationId" = $2 AND "deletedAt" IS NULL`,
          [rootId, user.organizationId],
        )
      : null;
    if (rootId && !scope) throw new NotFoundException('Folder not found');

    const all = await this.db.query<Folder>(
      `SELECT * FROM folders
        WHERE "organizationId" = $1
          AND "deletedAt" IS NULL
          AND ($2::text IS NULL OR starts_with(path, $2))
        ORDER BY depth ASC, name ASC`,
      [user.organizationId, scope?.path ?? null],
    );

    const visible = await this.filterReadable(user, all);
    return this.buildTree(visible, scope?.parentId ?? null);
  }

  async rename(user: AuthUser, id: string, name: string): Promise<Folder> {
    await this.access.assertFolder(user, id, AccessLevel.WRITE);
    const folder = await this.requireFolder(user, id);
    const next = this.normaliseName(name);

    const clash = await this.db.maybeOne<{ id: string }>(
      `SELECT id FROM folders
        WHERE "organizationId" = $1
          AND "parentId" IS NOT DISTINCT FROM $2
          AND name = $3
          AND "deletedAt" IS NULL
          AND id <> $4`,
      [user.organizationId, folder.parentId, next, id],
    );
    if (clash) throw new BadRequestException(`A folder named "${next}" already exists here`);

    const updated = await this.db.one<Folder>(
      `UPDATE folders SET name = $1, "updatedAt" = now() WHERE id = $2 RETURNING *`,
      [next, id],
    );

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.FOLDER_UPDATE,
      resourceType: 'Folder',
      resourceId: id,
      resourceName: next,
      changes: { name: { from: folder.name, to: next } },
    });

    return updated;
  }

  /**
   * Moves a subtree. Rewrites the path of every descendant in one statement,
   * and refuses to move a folder into itself, which would orphan the subtree.
   */
  async move(user: AuthUser, id: string, newParentId: string | null): Promise<Folder> {
    await this.access.assertFolder(user, id, AccessLevel.WRITE);
    const folder = await this.requireFolder(user, id);

    let newParent: Folder | null = null;
    if (newParentId) {
      newParent = await this.requireFolder(user, newParentId);
      await this.access.assertFolder(user, newParentId, AccessLevel.WRITE);

      if (newParent.path.startsWith(folder.path)) {
        throw new BadRequestException('Cannot move a folder into its own subtree');
      }
    }

    const oldPath = folder.path;
    const newPath = `${newParent ? newParent.path : '/'}${folder.id}/`;
    const depthDelta = (newParent ? newParent.depth + 1 : 0) - folder.depth;

    const deepest = await this.db.scalar<number>(
      `SELECT max(depth) FROM folders
        WHERE "organizationId" = $1 AND starts_with(path, $2)`,
      [user.organizationId, oldPath],
    );
    if ((deepest ?? 0) + depthDelta > MAX_DEPTH) {
      throw new BadRequestException(`Move would exceed the folder nesting limit of ${MAX_DEPTH}`);
    }

    const updated = await this.db.transaction(async () => {
      // Descendants first: rewrite the shared prefix and shift depth.
      await this.db.execute(
        `UPDATE folders
            SET path = $1 || substring(path from $2),
                depth = depth + $3
          WHERE "organizationId" = $4
            AND starts_with(path, $5)
            AND id <> $6`,
        [newPath, oldPath.length + 1, depthDelta, user.organizationId, oldPath, folder.id],
      );

      return this.db.one<Folder>(
        `UPDATE folders
            SET "parentId" = $1, path = $2, depth = $3, "updatedAt" = now()
          WHERE id = $4
      RETURNING *`,
        [newParent?.id ?? null, newPath, folder.depth + depthDelta, folder.id],
      );
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.FOLDER_UPDATE,
      resourceType: 'Folder',
      resourceId: id,
      resourceName: folder.name,
      changes: { parentId: { from: folder.parentId, to: newParentId } },
    });

    return updated;
  }

  /**
   * Soft-deletes a folder and everything under it (feature 24: recoverable).
   * Refuses when any descendant document is under legal hold.
   */
  async softDelete(user: AuthUser, id: string, recycleBinDays: number): Promise<{ folders: number; documents: number }> {
    await this.access.assertFolder(user, id, AccessLevel.MANAGE);
    const folder = await this.requireFolder(user, id);

    const held = await this.db.count(
      `SELECT count(*)
         FROM legal_holds h
         JOIN documents d ON d.id = h."documentId"
         JOIN folders f   ON f.id = d."folderId"
        WHERE h."releasedAt" IS NULL
          AND f."organizationId" = $1
          AND starts_with(f.path, $2)`,
      [user.organizationId, folder.path],
    );
    if (held > 0) {
      throw new ForbiddenException(
        `${held} document(s) in this folder are under legal hold and cannot be deleted.`,
      );
    }

    const purgeAfter = new Date(Date.now() + recycleBinDays * 24 * 60 * 60 * 1000);

    const result = await this.db.transaction(async () => {
      const documents = await this.db.execute(
        `UPDATE documents d
            SET "deletedAt" = now(), "deletedById" = $1, "purgeAfter" = $2, "updatedAt" = now()
           FROM folders f
          WHERE f.id = d."folderId"
            AND d."organizationId" = $3
            AND d."deletedAt" IS NULL
            AND starts_with(f.path, $4)`,
        [user.id, purgeAfter, user.organizationId, folder.path],
      );

      const folders = await this.db.execute(
        `UPDATE folders
            SET "deletedAt" = now(), "purgeAfter" = $1, "updatedAt" = now()
          WHERE "organizationId" = $2
            AND starts_with(path, $3)
            AND "deletedAt" IS NULL`,
        [purgeAfter, user.organizationId, folder.path],
      );

      return { folders, documents };
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.FOLDER_DELETE,
      resourceType: 'Folder',
      resourceId: id,
      resourceName: folder.name,
      metadata: result,
    });

    return result;
  }

  // ---------------------------------------------------------------------------

  private async requireFolder(user: AuthUser, id: string): Promise<Folder> {
    const folder = await this.db.maybeOne<Folder>(
      `SELECT * FROM folders
        WHERE id = $1 AND "organizationId" = $2 AND "deletedAt" IS NULL`,
      [id, user.organizationId],
    );
    if (!folder) throw new NotFoundException('Folder not found');
    return folder;
  }

  /**
   * Drops folders the user cannot read. Resolving each one individually would
   * be N queries, so readable ids are computed once and intersected.
   */
  private async filterReadable(user: AuthUser, folders: Folder[]): Promise<Folder[]> {
    const readable = await this.access.readableFolderIds(user);
    if (readable === null) return folders; // administrator
    const allowed = new Set(readable);
    return folders.filter((f) => allowed.has(f.id));
  }

  private buildTree(folders: Folder[], rootParentId: string | null) {
    type Node = Folder & { children: Node[] };
    const byId = new Map<string, Node>();
    for (const f of folders) byId.set(f.id, { ...f, children: [] });

    const roots: Node[] = [];
    for (const node of byId.values()) {
      const parent = node.parentId ? byId.get(node.parentId) : undefined;
      // A node whose parent was pruned by permissions is lifted to the top,
      // rather than vanishing along with its readable children.
      if (parent) parent.children.push(node);
      else if (node.parentId === rootParentId || !node.parentId || !byId.has(node.parentId)) roots.push(node);
    }
    return roots;
  }

  private normaliseName(raw: string): string {
    const name = raw.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ');
    if (!name) throw new BadRequestException('Folder name cannot be empty');
    if (name === '.' || name === '..') throw new BadRequestException('Invalid folder name');
    if (name.length > 200) throw new BadRequestException('Folder name is too long (max 200)');
    return name;
  }
}
