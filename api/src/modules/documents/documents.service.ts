import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import type { AppConfig } from '../../common/config/configuration';
import { DatabaseService, Params, every, newId, paginate } from '../../common/db';
import {
  AccessLevel,
  AuditAction,
  ChangeOp,
  ChannelType,
  Classification,
  ContentKind,
  DocumentStatus,
  type Document,
  type DocumentVersion,
} from '../../common/db';
import { LicenseService } from '../../common/licensing/license.service';
import type { AuthUser } from '../../common/types/auth.types';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';

export interface IngestInput {
  buffer: Buffer;
  originalName: string;
  mimeType: string;
  folderId?: string | null;
  classification?: Classification;
  description?: string;
  /** Channel the file arrived on, for the audit trail and the Inbox screen. */
  channel?: ChannelType;
  /** Sender identity on that channel (phone number, email address). */
  sourceRef?: string | null;
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly license: LicenseService,
    private readonly storage: StorageService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<{ app: AppConfig }, true>,
  ) {}

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  /**
   * Stores bytes and creates version 1. Used by the web upload, the WhatsApp
   * handler and the email handler alike, so every entry path gets the same
   * classification defaults, audit record and change-log entry.
   */
  async ingest(user: AuthUser, input: IngestInput): Promise<Document> {
    if (!input.buffer?.length) throw new BadRequestException('Empty file');

    // A database trigger also refuses this, but that surfaces as a 500. Caught
    // here so the caller gets an explanation instead of an internal error.
    if (user.isPlatform) {
      throw new ForbiddenException(
        'The platform organisation administers tenants and does not hold documents. Sign in to a customer organisation to upload.',
      );
    }

    // New records need a live subscription. Reading and downloading existing
    // ones never does — see LicenseService.
    await this.license.assertWritable(user.organizationId);

    const maxBytes = this.config.get('app', { infer: true }).storage.maxUploadBytes;
    if (input.buffer.length > maxBytes) {
      throw new BadRequestException(`File exceeds the maximum upload size of ${maxBytes} bytes`);
    }

    let folderClassification: Classification | undefined;
    if (input.folderId) {
      await this.access.assertFolder(user, input.folderId, AccessLevel.WRITE);
      const folder = await this.db.maybeOne<{ classification: Classification }>(
        `SELECT classification FROM folders
          WHERE id = $1 AND "organizationId" = $2 AND "deletedAt" IS NULL`,
        [input.folderId, user.organizationId],
      );
      if (!folder) throw new NotFoundException('Folder not found');
      folderClassification = folder.classification;
    }

    const stored = await this.storage.putBuffer(input.buffer, input.originalName);
    const name = this.safeName(input.originalName);

    const document = await this.db.transaction(async () => {
      const docId = newId();
      const versionId = newId();

      const doc = await this.db.one<Document>(
        `INSERT INTO documents (id, "organizationId", "folderId", name, description, kind, "mimeType",
                                status, classification, "ownerId", "sourceChannel", "sourceRef",
                                "versionCount", "createdAt", "updatedAt")
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 0, now(), now())
           RETURNING *`,
        [
          docId,
          user.organizationId,
          input.folderId ?? null,
          name,
          input.description ?? null,
          kindFromMime(input.mimeType),
          input.mimeType,
          DocumentStatus.ACTIVE,
          // The folder is a floor, never a ceiling: the more sensitive of what
          // the caller asked for and what the folder carries.
          //
          // Taking the caller's value outright — which this did — let an
          // explicit classification undercut the folder, so a PUBLIC upload
          // into a RESTRICTED drawer stayed PUBLIC. Move and reclassify both
          // refuse that, and upload was the way round it.
          atLeastFolder(input.classification, folderClassification),
          user.id,
          input.channel ?? ChannelType.WEB,
          input.sourceRef ?? null,
        ],
      );

      await this.db.execute(
        `INSERT INTO document_versions (id, "documentId", "versionNumber", "storageDriver", "storageKey",
                                        "sizeBytes", checksum, "mimeType", "changeSummary", "authorId",
                                        "createdAt")
              VALUES ($1, $2, 1, $3, $4, $5, $6, $7, 'Initial upload', $8, now())`,
        [versionId, doc.id, stored.driver, stored.key, String(stored.size), stored.checksum, input.mimeType, user.id],
      );

      const updated = await this.db.one<Document>(
        `UPDATE documents SET "currentVersionId" = $1, "versionCount" = 1, "updatedAt" = now()
          WHERE id = $2 RETURNING *`,
        [versionId, doc.id],
      );

      await this.db.execute(
        `INSERT INTO change_log ("organizationId", "entityType", "entityId", op, "actorId",
                                 snapshot, "createdAt")
              VALUES ($1, 'document', $2, $3, $4, $5, now())`,
        [
          user.organizationId,
          doc.id,
          ChangeOp.CREATE,
          user.id,
          JSON.stringify({ id: doc.id, name, folderId: doc.folderId, versionNumber: 1 }),
        ],
      );

      return updated;
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.DOCUMENT_CREATE,
      resourceType: 'Document',
      resourceId: document.id,
      resourceName: document.name,
      channel: input.channel ?? ChannelType.WEB,
      metadata: { size: stored.size, mimeType: input.mimeType, checksum: stored.checksum },
    });

    // TODO(pipeline): enqueue VIRUS_SCAN -> OCR -> TEXT_INDEX -> EMBED ->
    // CLASSIFY here once ProcessingModule is wired to a queue.

    return document;
  }

  /** Adds a new version to an existing document (feature 12). */
  async addVersion(
    user: AuthUser,
    documentId: string,
    input: { buffer: Buffer; originalName: string; mimeType: string; changeSummary?: string },
  ): Promise<Document> {
    await this.access.assertDocument(user, documentId, AccessLevel.WRITE);

    const doc = await this.requireDocument(user, documentId);

    // Respect an editing lock held by somebody else (feature 12/22).
    if (doc.checkedOutById && doc.checkedOutById !== user.id) {
      throw new ConflictException('Document is checked out by another user');
    }

    const stored = await this.storage.putBuffer(input.buffer, input.originalName);

    const updated = await this.db.transaction(async () => {
      // FOR UPDATE, not a plain read: two concurrent uploads must not both see
      // the same versionCount and claim the same version number. The row lock
      // is what serialises them; re-reading alone would not.
      const current = await this.db.one<{ versionCount: number }>(
        `SELECT "versionCount" FROM documents WHERE id = $1 FOR UPDATE`,
        [documentId],
      );
      const nextNumber = current.versionCount + 1;
      const versionId = newId();

      await this.db.execute(
        `INSERT INTO document_versions (id, "documentId", "versionNumber", "storageDriver", "storageKey",
                                        "sizeBytes", checksum, "mimeType", "changeSummary", "authorId",
                                        "createdAt")
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
        [
          versionId,
          documentId,
          nextNumber,
          stored.driver,
          stored.key,
          String(stored.size),
          stored.checksum,
          input.mimeType,
          input.changeSummary ?? `Version ${nextNumber}`,
          user.id,
        ],
      );

      await this.db.execute(
        `INSERT INTO change_log ("organizationId", "entityType", "entityId", op, "actorId",
                                 snapshot, "createdAt")
              VALUES ($1, 'version', $2, $3, $4, $5, now())`,
        [
          user.organizationId,
          versionId,
          ChangeOp.CREATE,
          user.id,
          JSON.stringify({ documentId, versionNumber: nextNumber }),
        ],
      );

      return this.db.one<Document>(
        `UPDATE documents
            SET "currentVersionId" = $1, "versionCount" = $2, "mimeType" = $3,
                "checkedOutById" = NULL, "checkedOutAt" = NULL, "updatedAt" = now()
          WHERE id = $4
      RETURNING *`,
        [versionId, nextNumber, input.mimeType, documentId],
      );
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.VERSION_CREATE,
      resourceType: 'Document',
      resourceId: documentId,
      resourceName: doc.name,
      metadata: { version: updated.versionCount, checksum: stored.checksum },
    });

    return updated;
  }

  /**
   * Promotes an old version back to current. Implemented as a new version
   * pointing at the old bytes, never as a rewind - the history stays intact,
   * which is the whole point of an audit trail.
   */
  async restoreVersion(user: AuthUser, documentId: string, versionNumber: number): Promise<Document> {
    await this.access.assertDocument(user, documentId, AccessLevel.WRITE);

    const source = await this.db.maybeOne<DocumentVersion>(
      `SELECT * FROM document_versions WHERE "documentId" = $1 AND "versionNumber" = $2`,
      [documentId, versionNumber],
    );
    if (!source) throw new NotFoundException(`Version ${versionNumber} not found`);

    const updated = await this.db.transaction(async () => {
      const current = await this.db.one<{ versionCount: number }>(
        `SELECT "versionCount" FROM documents WHERE id = $1 FOR UPDATE`,
        [documentId],
      );
      const nextNumber = current.versionCount + 1;
      const versionId = newId();

      await this.db.execute(
        `INSERT INTO document_versions (id, "documentId", "versionNumber", "storageDriver", "storageKey",
                                        "sizeBytes", checksum, "mimeType", "changeSummary", "authorId",
                                        "createdAt")
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
        [
          versionId,
          documentId,
          nextNumber,
          source.storageDriver,
          // Same storage key: the bytes are immutable and shared, no copy needed.
          source.storageKey,
          source.sizeBytes,
          source.checksum,
          source.mimeType,
          `Restored from version ${versionNumber}`,
          user.id,
        ],
      );

      return this.db.one<Document>(
        `UPDATE documents SET "currentVersionId" = $1, "versionCount" = $2, "updatedAt" = now()
          WHERE id = $3 RETURNING *`,
        [versionId, nextNumber, documentId],
      );
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.VERSION_RESTORE,
      resourceType: 'Document',
      resourceId: documentId,
      metadata: { restoredFrom: versionNumber, newVersion: updated.versionCount },
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------

  async findOne(user: AuthUser, id: string) {
    await this.access.assertDocument(user, id, AccessLevel.READ);

    const doc = await this.db.maybeOne(
      `SELECT d.*,
              to_jsonb(v.*) AS "currentVersion",
              CASE WHEN f.id IS NULL THEN NULL ELSE
                json_build_object('id', f.id, 'name', f.name, 'path', f.path,
                                  'classification', f.classification) END AS folder,
              CASE WHEN o.id IS NULL THEN NULL ELSE
                json_build_object('id', o.id, 'displayName', o."displayName", 'email', o.email) END AS owner,
              COALESCE(tg.tags, '[]'::json)   AS tags,
              COALESCE(su.items, '[]'::json)  AS summaries,
              COALESCE(lh.items, '[]'::json)  AS "legalHolds"
         FROM documents d
         LEFT JOIN document_versions v ON v.id = d."currentVersionId"
         LEFT JOIN folders f ON f.id = d."folderId"
         LEFT JOIN users o   ON o.id = d."ownerId"
         LEFT JOIN LATERAL (
                SELECT json_agg(json_build_object('tag', to_jsonb(t.*))) AS tags
                  FROM document_tags dt JOIN tags t ON t.id = dt."tagId"
                 WHERE dt."documentId" = d.id
              ) tg ON TRUE
         LEFT JOIN LATERAL (
                SELECT json_agg(to_jsonb(s.*)) AS items
                  FROM (SELECT * FROM document_summaries
                         WHERE "documentId" = d.id
                         ORDER BY "createdAt" DESC LIMIT 1) s
              ) su ON TRUE
         LEFT JOIN LATERAL (
                SELECT json_agg(to_jsonb(h.*)) AS items
                  FROM legal_holds h
                 WHERE h."documentId" = d.id AND h."releasedAt" IS NULL
              ) lh ON TRUE
        WHERE d.id = $1 AND d."organizationId" = $2`,
      [id, user.organizationId],
    );
    if (!doc) throw new NotFoundException('Document not found');

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.DOCUMENT_VIEW,
      resourceType: 'Document',
      resourceId: id,
      resourceName: doc.name as string,
    });

    return doc;
  }

  async listVersions(user: AuthUser, documentId: string) {
    await this.access.assertDocument(user, documentId, AccessLevel.READ);
    return this.db.query(
      `SELECT v.*,
              CASE WHEN a.id IS NULL THEN NULL ELSE
                json_build_object('id', a.id, 'displayName', a."displayName") END AS author
         FROM document_versions v
         LEFT JOIN users a ON a.id = v."authorId"
        WHERE v."documentId" = $1
        ORDER BY v."versionNumber" DESC`,
      [documentId],
    );
  }

  /**
   * Opens the bytes for download. Requires DOWNLOAD, not READ - feature 18
   * turns on view-without-download, and that distinction has to be enforced
   * at the only place the bytes leave the system.
   */
  async openContent(
    user: AuthUser,
    documentId: string,
    versionNumber?: number,
  ): Promise<{ stream: Readable; document: Document; filename: string; mimeType: string; size: number }> {
    await this.access.assertDocument(user, documentId, AccessLevel.DOWNLOAD);
    const doc = await this.requireDocument(user, documentId);

    const version = versionNumber
      ? await this.db.maybeOne<DocumentVersion>(
          `SELECT * FROM document_versions WHERE "documentId" = $1 AND "versionNumber" = $2`,
          [documentId, versionNumber],
        )
      : doc.currentVersionId
        ? await this.db.maybeOne<DocumentVersion>(`SELECT * FROM document_versions WHERE id = $1`, [
            doc.currentVersionId,
          ])
        : null;

    if (!version) throw new NotFoundException('Version not found');

    const stream = await this.storage.getStream(version.storageKey);

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.DOCUMENT_DOWNLOAD,
      resourceType: 'Document',
      resourceId: documentId,
      resourceName: doc.name,
      metadata: { version: version.versionNumber },
    });

    return {
      stream,
      document: doc,
      filename: doc.name,
      mimeType: version.mimeType,
      size: Number(version.sizeBytes),
    };
  }

  async list(
    user: AuthUser,
    params: { folderId?: string | null; skip?: number; take?: number; includeDeleted?: boolean },
  ) {
    const readable = await this.access.readableFolderIds(user);

    const clause = (p: Params) =>
      every([
        `d."organizationId" = ${p.add(user.organizationId)}`,
        params.includeDeleted ? null : `d."deletedAt" IS NULL`,
        params.folderId !== undefined
          ? `d."folderId" IS NOT DISTINCT FROM ${p.add(params.folderId)}`
          : null,
        // Non-admins see only documents in readable folders, plus their own
        // unfiled uploads. Anything else must not even appear in a count.
        readable === null
          ? null
          : `(d."folderId" = ANY(${p.add(readable)}::text[]) OR d."ownerId" = ${p.add(user.id)})`,
      ]);

    const p = new Params();
    const where = clause(p);
    const page = paginate(params.take, params.skip);

    const items = await this.db.query(
      `SELECT d.*,
              CASE WHEN v.id IS NULL THEN NULL ELSE
                json_build_object('versionNumber', v."versionNumber", 'sizeBytes', v."sizeBytes",
                                  'createdAt', v."createdAt") END AS "currentVersion",
              CASE WHEN o.id IS NULL THEN NULL ELSE
                json_build_object('id', o.id, 'displayName', o."displayName") END AS owner
         FROM documents d
         LEFT JOIN document_versions v ON v.id = d."currentVersionId"
         LEFT JOIN users o ON o.id = d."ownerId"
        WHERE ${where}
        ORDER BY d."updatedAt" DESC
        ${page.text}`,
      p.values,
    );

    const cp = new Params();
    const total = await this.db.count(`SELECT count(*) FROM documents d WHERE ${clause(cp)}`, cp.values);

    return { items, total };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Soft delete into the recycle bin (feature 24). */
  async softDelete(user: AuthUser, id: string): Promise<void> {
    await this.access.assertDocument(user, id, AccessLevel.WRITE);
    const doc = await this.requireDocument(user, id);

    const hold = await this.db.maybeOne<{ reason: string }>(
      `SELECT reason FROM legal_holds WHERE "documentId" = $1 AND "releasedAt" IS NULL`,
      [id],
    );
    if (hold) {
      throw new ForbiddenException(`Document is under legal hold (${hold.reason}) and cannot be deleted.`);
    }

    const days = this.config.get('app', { infer: true }).recycleBinDays;
    const purgeAfter = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    await this.db.transaction(async () => {
      await this.db.execute(
        `UPDATE documents
            SET "deletedAt" = now(), "deletedById" = $1, "purgeAfter" = $2, status = $3,
                "updatedAt" = now()
          WHERE id = $4`,
        [user.id, purgeAfter, DocumentStatus.DELETED, id],
      );
      await this.db.execute(
        `INSERT INTO change_log ("organizationId", "entityType", "entityId", op, "actorId", "createdAt")
              VALUES ($1, 'document', $2, $3, $4, now())`,
        [user.organizationId, id, ChangeOp.DELETE, user.id],
      );
    });

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.DOCUMENT_DELETE,
      resourceType: 'Document',
      resourceId: id,
      resourceName: doc.name,
      metadata: { recoverableUntil: purgeAfter.toISOString() },
    });
  }

  /** Pulls a document back out of the recycle bin (feature 24). */
  async restore(user: AuthUser, id: string): Promise<Document> {
    const doc = await this.db.maybeOne<Document>(
      `SELECT * FROM documents
        WHERE id = $1 AND "organizationId" = $2 AND "deletedAt" IS NOT NULL`,
      [id, user.organizationId],
    );
    if (!doc) throw new NotFoundException('No deleted document with that id');

    // The folder may have been deleted too; restoring into a dead folder would
    // make the document invisible, so it goes back to the root instead.
    let folderId = doc.folderId;
    if (folderId) {
      const folder = await this.db.maybeOne<{ id: string }>(
        `SELECT id FROM folders WHERE id = $1 AND "deletedAt" IS NULL`,
        [folderId],
      );
      if (!folder) folderId = null;
    }

    const restored = await this.db.one<Document>(
      `UPDATE documents
          SET "deletedAt" = NULL, "deletedById" = NULL, "purgeAfter" = NULL,
              "folderId" = $1, status = $2, "updatedAt" = now()
        WHERE id = $3
    RETURNING *`,
      [folderId, DocumentStatus.ACTIVE, id],
    );

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.DOCUMENT_RESTORE,
      resourceType: 'Document',
      resourceId: id,
      resourceName: doc.name,
      metadata: { restoredToRoot: folderId === null && doc.folderId !== null },
    });

    return restored;
  }

  async listRecycleBin(user: AuthUser, params: { skip?: number; take?: number } = {}) {
    const page = paginate(params.take, params.skip);

    const items = await this.db.query<Document>(
      `SELECT * FROM documents
        WHERE "organizationId" = $1 AND "deletedAt" IS NOT NULL
        ORDER BY "deletedAt" DESC
        ${page.text}`,
      [user.organizationId],
    );

    const total = await this.db.count(
      `SELECT count(*) FROM documents WHERE "organizationId" = $1 AND "deletedAt" IS NOT NULL`,
      [user.organizationId],
    );

    return { items, total };
  }

  /** Takes an editing lock so a co-worker's save cannot clobber yours. */
  async checkOut(user: AuthUser, id: string): Promise<Document> {
    await this.access.assertDocument(user, id, AccessLevel.WRITE);
    await this.requireDocument(user, id);

    // Conditional on the lock still being free, so two people clicking at once
    // cannot both believe they hold it.
    const locked = await this.db.maybeOne<Document>(
      `UPDATE documents
          SET "checkedOutById" = $1, "checkedOutAt" = now(), "updatedAt" = now()
        WHERE id = $2 AND ("checkedOutById" IS NULL OR "checkedOutById" = $1)
    RETURNING *`,
      [user.id, id],
    );
    if (!locked) throw new ConflictException('Document is already checked out');
    return locked;
  }

  async checkIn(user: AuthUser, id: string): Promise<Document> {
    const doc = await this.requireDocument(user, id);
    // An admin can break a lock a departed colleague left behind.
    const canForce = user.tier === 'SYSTEM_ADMIN' || user.tier === 'ORG_ADMIN';
    if (doc.checkedOutById && doc.checkedOutById !== user.id && !canForce) {
      throw new ForbiddenException('Only the lock holder or an administrator can check this document in');
    }
    return this.db.one<Document>(
      `UPDATE documents SET "checkedOutById" = NULL, "checkedOutAt" = NULL, "updatedAt" = now()
        WHERE id = $1 RETURNING *`,
      [id],
    );
  }

  // ---------------------------------------------------------------------------

  private async requireDocument(user: AuthUser, id: string): Promise<Document> {
    const doc = await this.db.maybeOne<Document>(
      `SELECT * FROM documents
        WHERE id = $1 AND "organizationId" = $2 AND "deletedAt" IS NULL`,
      [id, user.organizationId],
    );
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  /**
   * Strips path separators, control characters and the characters Windows
   * rejects in a filename. The name is only a label - the bytes live under a
   * generated storage key - but it still reaches a Content-Disposition
   * header, so it must never carry CR or LF.
   */
  private safeName(raw: string): string {
    const base = raw.split(/[\\/]/).pop() ?? 'untitled';
    // eslint-disable-next-line no-control-regex
    const clean = base.replace(/[\u0000-\u001f<>:"|?*]/g, '').trim();
    return (clean || 'untitled').slice(0, 255);
  }


  /**
   * A rendering of a document, for somebody permitted to read but not download
   * (VEW-2).
   *
   * The requirement is that viewing must not require the ability to take a
   * copy. The content endpoint hands over the stored bytes and is therefore
   * gated on DOWNLOAD, which left a reader with nothing — so this serves the
   * indexed text instead. Nothing of the original file reaches the browser:
   * no bytes, no storage key, no signed URL.
   *
   * It is deliberately honest about its limits. A scan with no text layer has
   * no rendering here, and saying so is better than quietly serving the file
   * and defeating the restriction the caller is under. Closing that case needs
   * page images from a rasteriser, which belongs with the viewer.
   */
  async renderForReading(user: AuthUser, id: string) {
    const doc = await this.findOne(user, id);

    const index = await this.db.maybeOne<{ contentText: string; wordCount: number }>(
      `SELECT i."contentText", i."wordCount"
         FROM document_index i
         JOIN documents d ON d.id = i."documentId"
        WHERE i."documentId" = $1 AND d."organizationId" = $2`,
      [id, user.organizationId],
    );

    // Reading a document is an event in its own right, and one an auditor asks
    // about. Recorded here as well as on download, or a view-only reader would
    // leave no trace at all.
    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.DOCUMENT_VIEW,
      resourceType: 'Document',
      resourceId: id,
      resourceName: doc.name as string,
      metadata: { event: 'rendered_for_reading' },
    });

    const text = index?.contentText?.trim();
    if (!text) {
      return {
        kind: 'none' as const,
        name: doc.name,
        mimeType: doc.mimeType,
        reason:
          'This file has no text layer yet, so there is nothing that can be shown without handing '
          + 'over the file itself. Text extraction has not run on it.',
      };
    }

    // Capped rather than streamed. This is a reading pane, not an export, and
    // a thousand-page contract arriving in one response helps nobody.
    const LIMIT = 200_000;
    return {
      kind: 'text' as const,
      name: doc.name,
      mimeType: doc.mimeType,
      classification: doc.classification,
      wordCount: index?.wordCount ?? null,
      truncated: text.length > LIMIT,
      text: text.slice(0, LIMIT),
    };
  }

  /* -- Move and reclassify ---------------------------------------------------

     Both change where a document sits in the access model, so both need write
     on what they are leaving and on what they are joining, and both are
     audited. Neither existed, which is why the Repository toolbar's Move and
     Classify verbs had nothing to call.
     ------------------------------------------------------------------------ */

  /** Moves a document to another folder (feature 4). */
  async move(user: AuthUser, id: string, folderId: string | null) {
    const doc = await this.findOne(user, id);
    await this.access.assertDocument(user, id, AccessLevel.WRITE);

    let destination: { classification: Classification; name: string } | null = null;
    if (folderId) {
      // Write on the destination too: moving a record into a folder puts it in
      // front of that folder's readers, which needs the same permission as
      // filing it there in the first place.
      await this.access.assertFolder(user, folderId, AccessLevel.WRITE);
      destination = await this.db.maybeOne<{ classification: Classification; name: string }>(
        `SELECT classification, name FROM folders
          WHERE id = $1 AND "organizationId" = $2 AND "deletedAt" IS NULL`,
        [folderId, user.organizationId],
      );
      if (!destination) throw new NotFoundException('Folder not found');

      // A folder raises the floor for everything inside it, so a document
      // cannot be moved into somewhere more sensitive than itself without
      // being reclassified first — otherwise the folder's restriction would
      // apply to a record that does not carry it (FIL-9).
      if (RANK[destination.classification] > RANK[doc.classification as Classification]) {
        throw new BadRequestException(
          `${destination.name} is ${destination.classification.toLowerCase()}. `
            + 'Reclassify the document to at least that before moving it there.',
        );
      }
    }

    await this.db.execute(
      'UPDATE documents SET "folderId" = $1, "updatedAt" = now() WHERE id = $2',
      [folderId, id],
    );

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.DOCUMENT_MOVE,
      resourceType: 'Document',
      resourceId: id,
      resourceName: doc.name as string,
      metadata: { event: 'document_moved', from: doc.folderId as string | null, to: folderId },
    });

    return this.findOne(user, id);
  }

  /**
   * Changes a document's classification (FIL-9).
   *
   * Lowering it below the folder it sits in is refused. The folder's level is
   * the floor for everything inside it, and a document that could be
   * declassified in place would let anyone with write access route around the
   * folder's own restriction.
   */
  async reclassify(user: AuthUser, id: string, classification: Classification) {
    const doc = await this.findOne(user, id);
    await this.access.assertDocument(user, id, AccessLevel.WRITE);

    if (doc.folderId) {
      const folder = await this.db.maybeOne<{ classification: Classification; name: string }>(
        'SELECT classification, name FROM folders WHERE id = $1',
        [doc.folderId as string],
      );
      if (folder && RANK[classification] < RANK[folder.classification]) {
        throw new BadRequestException(
          `${folder.name} is ${folder.classification.toLowerCase()}, so a document inside it `
            + `cannot be ${classification.toLowerCase()}. Move it out first.`,
        );
      }
    }

    await this.db.execute(
      'UPDATE documents SET classification = $1, "updatedAt" = now() WHERE id = $2',
      [classification, id],
    );

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.DOCUMENT_UPDATE,
      resourceType: 'Document',
      resourceId: id,
      resourceName: doc.name as string,
      metadata: { event: 'document_reclassified', from: doc.classification as Classification, to: classification },
    });

    return this.findOne(user, id);
  }
}

/** Sensitivity order, for the two comparisons above. */
const RANK: Record<Classification, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  CONFIDENTIAL: 2,
  RESTRICTED: 3,
};

function kindFromMime(mime: string): ContentKind {
  if (mime.startsWith('image/')) return ContentKind.IMAGE;
  if (mime.startsWith('audio/')) return ContentKind.AUDIO;
  if (mime.startsWith('video/')) return ContentKind.VIDEO;
  if (mime === 'message/rfc822') return ContentKind.EMAIL;
  if (/zip|tar|rar|7z|gzip/.test(mime)) return ContentKind.ARCHIVE;
  if (/pdf|word|excel|powerpoint|text|opendocument|officedocument/.test(mime)) return ContentKind.DOCUMENT;
  return ContentKind.OTHER;
}

/**
 * The more sensitive of what was asked for and what the folder carries.
 *
 * Defaults to INTERNAL when neither is known. Defaulting to PUBLIC here would
 * be the single most dangerous line in the application.
 */
function atLeastFolder(
  requested: Classification | undefined,
  folder: Classification | undefined,
): Classification {
  const asked = requested ?? folder ?? Classification.INTERNAL;
  if (!folder) return asked;
  return RANK[folder] > RANK[asked] ? folder : asked;
}
