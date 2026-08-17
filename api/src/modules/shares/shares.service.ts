import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Readable } from 'node:stream';
import type { AppConfig } from '../../common/config/configuration';
import { DatabaseService, Params, every, newId, paginate } from '../../common/db';
import {
  AccessLevel,
  AuditAction,
  ChannelType,
  ShareAccessAction,
  type ShareLink,
} from '../../common/db';
import { evaluateShareSafety } from '../../common/rbac/permissions';
import type { AuthUser } from '../../common/types/auth.types';
import { AccessService } from '../access/access.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';

export interface CreateShareInput {
  documentId: string;
  /** Explicit expiry. Omit to fall back to DEFAULT_SHARE_TTL_HOURS. */
  expiresAt?: Date | null;
  /** Convenience alternative to expiresAt. */
  expiresInHours?: number;
  /** Pass null explicitly to create a link that never expires. */
  neverExpires?: boolean;
  maxDownloads?: number | null;
  password?: string | null;
  allowDownload?: boolean;
  allowPrint?: boolean;
  watermark?: boolean;
  allowedEmails?: string[];
  requireEmailVerification?: boolean;
  note?: string;
  createdVia?: ChannelType;
}

export interface ShareContext {
  ip?: string;
  userAgent?: string;
}

interface TicketPayload {
  /** Share token this ticket is bound to. */
  t: string;
  /** Expiry, epoch seconds. */
  x: number;
  /** Whether the holder proved they may download, as opposed to only view. */
  d: 0 | 1;
  /** Viewer email, when the link required one. */
  e?: string;
}

@Injectable()
export class SharesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly storage: StorageService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<{ app: AppConfig }, true>,
  ) {}

  // ---------------------------------------------------------------------------
  // Creation (authenticated)
  // ---------------------------------------------------------------------------

  async create(user: AuthUser, input: CreateShareInput): Promise<{ share: ShareLink; url: string; warnings: string[] }> {
    // Creating a link that permits download requires the ability to download.
    // Otherwise a READ-only user could mint themselves a download route.
    const required = input.allowDownload === false ? AccessLevel.READ : AccessLevel.DOWNLOAD;
    await this.access.assertDocument(user, input.documentId, required);

    const doc = await this.db.maybeOne<{ id: string; name: string; classification: string }>(
      `SELECT id, name, classification FROM documents
        WHERE id = $1 AND "organizationId" = $2 AND "deletedAt" IS NULL`,
      [input.documentId, user.organizationId],
    );
    if (!doc) throw new NotFoundException('Document not found');

    const expiresAt = this.resolveExpiry(input);
    const allowedEmails = (input.allowedEmails ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);

    // A share link is external exposure by definition: anyone holding the URL
    // can reach it, logged in or not. So the classification rules are applied
    // in their external form for every link, not only for ones addressed to
    // outside recipients.
    const isExternal = true;

    // Feature 8: refuse shares that contradict the document's classification.
    const verdict = evaluateShareSafety({
      classification: doc.classification as never,
      isExternal,
      hasPassword: Boolean(input.password),
      allowDownload: input.allowDownload !== false,
      hasExpiry: expiresAt !== null,
      recipientCount: allowedEmails.length,
      actorTier: user.tier,
    });
    if (!verdict.allowed) {
      throw new ForbiddenException({
        message: 'This share is not permitted for the document classification.',
        classification: doc.classification,
        violations: verdict.violations,
      });
    }

    const share = await this.db.one<ShareLink>(
      `INSERT INTO share_links (id, token, "documentId", "expiresAt", "maxDownloads", "passwordHash",
                                "allowDownload", "allowPrint", watermark, "allowedEmails",
                                "requireEmailVerification", note, "createdById", "createdVia", "createdAt")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now())
         RETURNING *`,
      [
        newId(),
        this.generateToken(),
        doc.id,
        expiresAt,
        input.maxDownloads ?? null,
        input.password ? await argon2.hash(input.password) : null,
        input.allowDownload ?? true,
        input.allowPrint ?? true,
        input.watermark ?? false,
        allowedEmails,
        input.requireEmailVerification ?? false,
        input.note ?? null,
        user.id,
        input.createdVia ?? ChannelType.WEB,
      ],
    );

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.SHARE_CREATE,
      resourceType: 'Document',
      resourceId: doc.id,
      resourceName: doc.name,
      metadata: {
        shareId: share.id,
        expiresAt: expiresAt?.toISOString() ?? null,
        allowDownload: share.allowDownload,
        recipients: allowedEmails.length,
        classification: doc.classification,
      },
    });

    return { share, url: this.buildUrl(share.token), warnings: verdict.warnings };
  }

  /**
   * Every link issued across the organisation, for the Sharing area.
   *
   * Scoped to documents the caller can actually read: a link is a route to a
   * record, so listing one for a document you cannot open would leak both the
   * document's name and the fact that it is in circulation.
   */
  async listForOrganization(user: AuthUser, params: { skip?: number; take?: number } = {}) {
    const readable = await this.access.readableFolderIds(user);

    const clause = (p: Params) =>
      every([
        `d."organizationId" = ${p.add(user.organizationId)}`,
        `d."deletedAt" IS NULL`,
        readable === null
          ? null
          : `(d."folderId" = ANY(${p.add(readable)}::text[]) OR d."ownerId" = ${p.add(user.id)})`,
      ]);

    const p = new Params();
    const where = clause(p);
    const page = paginate(params.take ?? 100, params.skip);

    const items = await this.db.query<ShareLink & Record<string, unknown>>(
      `SELECT s.*,
              json_build_object('id', d.id, 'name', d.name, 'mimeType', d."mimeType",
                                'classification', d.classification) AS document,
              CASE WHEN u.id IS NULL THEN NULL ELSE
                json_build_object('id', u.id, 'displayName', u."displayName") END AS "createdBy",
              json_build_object('accesses', COALESCE(a.n, 0)) AS "_count"
         FROM share_links s
         JOIN documents d ON d.id = s."documentId"
         LEFT JOIN users u ON u.id = s."createdById"
         LEFT JOIN LATERAL (SELECT count(*) AS n FROM share_accesses
                             WHERE "shareLinkId" = s.id) a ON TRUE
        WHERE ${where}
        ORDER BY s."createdAt" DESC
        ${page.text}`,
      p.values,
    );

    const cp = new Params();
    const total = await this.db.count(
      `SELECT count(*) FROM share_links s JOIN documents d ON d.id = s."documentId"
        WHERE ${clause(cp)}`,
      cp.values,
    );

    return {
      items: items.map((s) => ({ ...s, url: this.buildUrl(s.token), status: this.statusOf(s) })),
      total,
    };
  }

  async listForDocument(user: AuthUser, documentId: string) {
    await this.access.assertDocument(user, documentId, AccessLevel.READ);

    const shares = await this.db.query<ShareLink & Record<string, unknown>>(
      `SELECT s.*,
              CASE WHEN u.id IS NULL THEN NULL ELSE
                json_build_object('id', u.id, 'displayName', u."displayName") END AS "createdBy",
              json_build_object('accesses', COALESCE(a.n, 0)) AS "_count"
         FROM share_links s
         LEFT JOIN users u ON u.id = s."createdById"
         LEFT JOIN LATERAL (SELECT count(*) AS n FROM share_accesses
                             WHERE "shareLinkId" = s.id) a ON TRUE
        WHERE s."documentId" = $1
        ORDER BY s."createdAt" DESC`,
      [documentId],
    );

    return shares.map((s) => ({ ...s, url: this.buildUrl(s.token), status: this.statusOf(s) }));
  }

  async revoke(user: AuthUser, id: string): Promise<void> {
    const share = await this.db.maybeOne<{
      id: string;
      documentId: string;
      documentName: string;
      organizationId: string;
    }>(
      `SELECT s.id, s."documentId", d.name AS "documentName", d."organizationId"
         FROM share_links s
         JOIN documents d ON d.id = s."documentId"
        WHERE s.id = $1`,
      [id],
    );
    if (!share || share.organizationId !== user.organizationId) {
      throw new NotFoundException('Share not found');
    }
    await this.access.assertDocument(user, share.documentId, AccessLevel.WRITE);

    await this.db.execute(`UPDATE share_links SET "revokedAt" = now() WHERE id = $1`, [id]);

    await this.audit.record({
      organizationId: user.organizationId,
      actorId: user.id,
      action: AuditAction.SHARE_REVOKE,
      resourceType: 'Document',
      resourceId: share.documentId,
      resourceName: share.documentName,
      metadata: { shareId: id },
    });
  }

  // ---------------------------------------------------------------------------
  // Public consumption (unauthenticated)
  // ---------------------------------------------------------------------------

  /**
   * Metadata for the share landing page.
   *
   * Deliberately reveals nothing beyond what the recipient needs: no owner, no
   * folder, no organisation, no internal ids. An expired or revoked link is
   * reported as expired rather than "not found", because the recipient legit-
   * imately needs to know to ask for a fresh one.
   */
  async getPublicMeta(token: string) {
    const share = await this.db.maybeOne<
      ShareLink & {
        docName: string;
        docMime: string;
        docDeletedAt: Date | null;
        sizeBytes: string | null;
        pageCount: number | null;
      }
    >(
      `SELECT s.*,
              d.name        AS "docName",
              d."mimeType"  AS "docMime",
              d."deletedAt" AS "docDeletedAt",
              v."sizeBytes",
              v."pageCount"
         FROM share_links s
         JOIN documents d ON d.id = s."documentId"
         LEFT JOIN document_versions v ON v.id = d."currentVersionId"
        WHERE s.token = $1`,
      [token],
    );
    if (!share || share.docDeletedAt) throw new NotFoundException('This link is not valid');

    const status = this.statusOf(share);
    if (status !== 'ACTIVE') throw new GoneException(`This link is ${status.toLowerCase()}`);

    await this.db.execute(
      `UPDATE share_links
          SET "viewCount" = "viewCount" + 1,
              "firstOpenedAt" = COALESCE("firstOpenedAt", now())
        WHERE id = $1`,
      [share.id],
    );

    return {
      name: share.docName,
      mimeType: share.docMime,
      size: Number(share.sizeBytes ?? 0),
      pageCount: share.pageCount ?? null,
      expiresAt: share.expiresAt,
      allowDownload: share.allowDownload,
      allowPrint: share.allowPrint,
      watermark: share.watermark,
      requiresPassword: Boolean(share.passwordHash),
      requiresEmail: share.requireEmailVerification || (share.allowedEmails?.length ?? 0) > 0,
      downloadsRemaining:
        share.maxDownloads === null ? null : Math.max(0, share.maxDownloads - share.downloadCount),
    };
  }

  /**
   * Validates the access code and issues a short-lived ticket.
   *
   * The two-step exists so the access code never travels in a URL, where it
   * would be captured by browser history, proxy logs and the Referer header
   * of anything the viewer subsequently clicks.
   */
  async authorize(
    token: string,
    body: { password?: string; email?: string },
    ctx: ShareContext,
  ): Promise<{ ticket: string; expiresIn: number; allowDownload: boolean }> {
    const share = await this.db.maybeOne<ShareLink & { docDeletedAt: Date | null }>(
      `SELECT s.*, d."deletedAt" AS "docDeletedAt"
         FROM share_links s
         JOIN documents d ON d.id = s."documentId"
        WHERE s.token = $1`,
      [token],
    );
    if (!share || share.docDeletedAt) throw new NotFoundException('This link is not valid');

    const status = this.statusOf(share);
    if (status !== 'ACTIVE') {
      await this.logAccess(share.id, ShareAccessAction.DENIED, status, ctx, body.email);
      throw new GoneException(`This link is ${status.toLowerCase()}`);
    }

    const email = body.email?.trim().toLowerCase();

    // The column is nullable, so an older row can hold NULL rather than an
    // empty array. Treating NULL as "no restriction" matches how the link was
    // created; treating it as "restricted to nobody" would lock recipients out.
    const namedRecipients = share.allowedEmails ?? [];

    if (namedRecipients.length > 0) {
      if (!email || !namedRecipients.includes(email)) {
        await this.logAccess(share.id, ShareAccessAction.DENIED, 'EMAIL_NOT_ALLOWED', ctx, email);
        // Same message whether the address is missing or simply not on the
        // list, so the link cannot be used to enumerate who it was sent to.
        throw new ForbiddenException('This link is restricted to named recipients');
      }
    } else if (share.requireEmailVerification && !email) {
      throw new BadRequestException('An email address is required to open this link');
    }

    if (share.passwordHash) {
      const ok = body.password ? await argon2.verify(share.passwordHash, body.password) : false;
      if (!ok) {
        await this.logAccess(share.id, ShareAccessAction.DENIED, 'BAD_PASSWORD', ctx, email);
        throw new UnauthorizedException('Incorrect access code');
      }
    }

    const ttl = this.config.get('app', { infer: true }).ticket.ttlSeconds;
    const ticket = this.signTicket({
      t: token,
      x: Math.floor(Date.now() / 1000) + ttl,
      d: share.allowDownload ? 1 : 0,
      ...(email ? { e: email } : {}),
    });

    await this.logAccess(share.id, ShareAccessAction.VIEW, null, ctx, email);

    return { ticket, expiresIn: ttl, allowDownload: share.allowDownload };
  }

  /** Streams the bytes for a valid ticket. */
  async openPublicContent(
    token: string,
    ticket: string,
    wantsAttachment: boolean,
    ctx: ShareContext,
  ): Promise<{ stream: Readable; filename: string; mimeType: string; size: number; allowDownload: boolean }> {
    const payload = this.verifyTicket(ticket);
    if (payload.t !== token) throw new UnauthorizedException('Ticket does not match this link');

    if (wantsAttachment && payload.d !== 1) {
      throw new ForbiddenException('Downloading is disabled for this link');
    }

    const share = await this.db.maybeOne<
      ShareLink & {
        docId: string;
        docName: string;
        docOrgId: string;
        docDeletedAt: Date | null;
        storageKey: string | null;
        versionMime: string | null;
        sizeBytes: string | null;
      }
    >(
      `SELECT s.*,
              d.id          AS "docId",
              d.name        AS "docName",
              d."organizationId" AS "docOrgId",
              d."deletedAt" AS "docDeletedAt",
              v."storageKey",
              v."mimeType"  AS "versionMime",
              v."sizeBytes"
         FROM share_links s
         JOIN documents d ON d.id = s."documentId"
         LEFT JOIN document_versions v ON v.id = d."currentVersionId"
        WHERE s.token = $1`,
      [token],
    );
    if (!share || share.docDeletedAt) throw new NotFoundException('This link is not valid');

    // Re-check state at the moment of delivery. A ticket issued 4 minutes ago
    // must not outlive a revocation that happened 1 minute ago.
    const status = this.statusOf(share);
    if (status !== 'ACTIVE') {
      await this.logAccess(share.id, ShareAccessAction.DENIED, status, ctx, payload.e);
      throw new GoneException(`This link is ${status.toLowerCase()}`);
    }

    if (!share.storageKey) throw new NotFoundException('This document has no content');

    if (wantsAttachment) {
      // Enforce the download cap atomically, so parallel requests cannot both
      // slip through on the last remaining download.
      if (share.maxDownloads !== null) {
        const claimed = await this.db.execute(
          `UPDATE share_links SET "downloadCount" = "downloadCount" + 1
            WHERE id = $1 AND "downloadCount" < $2`,
          [share.id, share.maxDownloads],
        );
        if (claimed === 0) {
          await this.logAccess(share.id, ShareAccessAction.DENIED, 'LIMIT_REACHED', ctx, payload.e);
          throw new GoneException('The download limit for this link has been reached');
        }
      } else {
        await this.db.execute(
          `UPDATE share_links SET "downloadCount" = "downloadCount" + 1 WHERE id = $1`,
          [share.id],
        );
      }
    }

    const stream = await this.storage.getStream(share.storageKey);

    await this.logAccess(
      share.id,
      wantsAttachment ? ShareAccessAction.DOWNLOAD : ShareAccessAction.VIEW,
      null,
      ctx,
      payload.e,
    );

    await this.audit.record({
      organizationId: share.docOrgId,
      actorId: null,
      actorLabel: payload.e ?? `share:${token.slice(0, 8)}`,
      action: AuditAction.SHARE_ACCESS,
      resourceType: 'Document',
      resourceId: share.docId,
      resourceName: share.docName,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { shareId: share.id, action: wantsAttachment ? 'DOWNLOAD' : 'VIEW' },
    });

    return {
      stream,
      filename: share.docName,
      mimeType: share.versionMime ?? 'application/octet-stream',
      size: Number(share.sizeBytes ?? 0),
      allowDownload: share.allowDownload,
    };
  }

  /** Marks links whose time frame has elapsed. Called by the cleanup job. */
  async expireOverdue(): Promise<number> {
    return this.db.execute(
      `UPDATE share_links SET "revokedAt" = now()
        WHERE "revokedAt" IS NULL AND "expiresAt" IS NOT NULL AND "expiresAt" < now()`,
    );
  }

  // ---------------------------------------------------------------------------

  private statusOf(share: Pick<ShareLink, 'revokedAt' | 'expiresAt' | 'maxDownloads' | 'downloadCount'>) {
    if (share.revokedAt) return 'REVOKED' as const;
    if (share.expiresAt && share.expiresAt.getTime() <= Date.now()) return 'EXPIRED' as const;
    if (share.maxDownloads !== null && share.downloadCount >= share.maxDownloads) return 'EXHAUSTED' as const;
    return 'ACTIVE' as const;
  }

  private resolveExpiry(input: CreateShareInput): Date | null {
    if (input.neverExpires) return null;
    if (input.expiresAt) return input.expiresAt;
    if (input.expiresInHours) return new Date(Date.now() + input.expiresInHours * 3600_000);

    const hours = this.config.get('app', { infer: true }).shares.defaultTtlHours;
    return hours > 0 ? new Date(Date.now() + hours * 3600_000) : null;
  }

  private buildUrl(token: string): string {
    return `${this.config.get('app', { infer: true }).webBaseUrl}/s/${token}`;
  }

  /** 32 bytes of entropy: not guessable, and short enough to paste into chat. */
  private generateToken(): string {
    return randomBytes(24).toString('base64url');
  }

  private signTicket(payload: TicketPayload): string {
    const secret = this.config.get('app', { infer: true }).ticket.secret;
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  private verifyTicket(ticket: string): TicketPayload {
    const secret = this.config.get('app', { infer: true }).ticket.secret;
    const [body, sig] = (ticket ?? '').split('.');
    if (!body || !sig) throw new UnauthorizedException('Malformed ticket');

    const expected = createHmac('sha256', secret).update(body).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    // Constant-time compare, and a length check first because timingSafeEqual
    // throws rather than returning false on a length mismatch.
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid ticket');
    }

    let payload: TicketPayload;
    try {
      payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TicketPayload;
    } catch {
      throw new UnauthorizedException('Malformed ticket');
    }

    if (payload.x * 1000 < Date.now()) throw new UnauthorizedException('Ticket has expired');
    return payload;
  }

  private async logAccess(
    shareLinkId: string,
    action: ShareAccessAction,
    reason: string | null,
    ctx: ShareContext,
    viewerEmail?: string,
  ): Promise<void> {
    await this.db.execute(
      `INSERT INTO share_accesses (id, "shareLinkId", action, reason, "viewerEmail", ip, "userAgent", "createdAt")
            VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
      [newId(), shareLinkId, action, reason, viewerEmail ?? null, ctx.ip ?? null, ctx.userAgent ?? null],
    );
  }
}
