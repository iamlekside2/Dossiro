import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessLevel, ChannelType, MessageDirection, MessageStatus } from '../../common/db';
import { simpleParser, type ParsedMail } from 'mailparser';
import { createTransport, type Transporter } from 'nodemailer';
import { timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '../../common/config/configuration';
import { DatabaseService, newId } from '../../common/db';
import type { AuthUser } from '../../common/types/auth.types';
import { AccessService } from '../access/access.service';
import { AuthService } from '../auth/auth.service';
import { DocumentsService } from '../documents/documents.service';
import { SearchService } from '../search/search.service';
import { SharesService } from '../shares/shares.service';

/** Attachments below this size are almost always signatures or tracking pixels. */
const MIN_ATTACHMENT_BYTES = 1024;

/**
 * Email channel (original feature 2).
 *
 * Inbound: your provider (Mailgun, SendGrid, Postmark, SES) POSTs the raw MIME
 * message to /api/channels/email/inbound. Attachments become documents.
 * Outbound: SMTP, used to deliver share links and workflow notifications.
 *
 * Same trust rule as WhatsApp: the From address must match a verified
 * ChannelIdentity. From addresses are trivially forged, so an unverified
 * sender gets nothing back beyond an explanation.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly documents: DocumentsService,
    private readonly shares: SharesService,
    private readonly search: SearchService,
    private readonly auth: AuthService,
    private readonly access: AccessService,
    private readonly config: ConfigService<{ app: AppConfig }, true>,
  ) {}

  private get cfg() {
    return this.config.get('app', { infer: true }).email;
  }

  /** Constant-time check of the shared secret on the inbound webhook URL. */
  assertInboundSecret(provided: string | undefined): void {
    const expected = this.cfg.inboundSecret;
    if (!expected) {
      this.logger.error('EMAIL_INBOUND_SECRET is not set; rejecting inbound mail webhook');
      throw new UnauthorizedException('Inbound mail is not configured');
    }
    const a = Buffer.from(provided ?? '', 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid inbound secret');
    }
  }

  /** Handles one raw MIME message. */
  async handleInbound(raw: Buffer): Promise<{ stored: number; messageId: string | null }> {
    const parsed: ParsedMail = await simpleParser(raw);

    const messageId = parsed.messageId ?? null;
    const from = parsed.from?.value?.[0]?.address?.toLowerCase() ?? null;
    const subject = parsed.subject ?? '(no subject)';

    if (messageId) {
      const existing = await this.db.maybeOne<{ id: string }>(
        `SELECT id FROM channel_messages WHERE channel = $1 AND "externalId" = $2`,
        [ChannelType.EMAIL, messageId],
      );
      if (existing) {
        this.logger.debug(`Ignoring duplicate inbound email ${messageId}`);
        return { stored: 0, messageId };
      }
    }

    const record = await this.db.one<{ id: string }>(
      `INSERT INTO channel_messages (id, channel, direction, "externalId", "fromAddr", "toAddr",
                                     subject, body, status, "createdAt")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
         RETURNING id`,
      [
        newId(),
        ChannelType.EMAIL,
        MessageDirection.INBOUND,
        messageId ?? null,
        from ?? null,
        (Array.isArray(parsed.to) ? parsed.to[0]?.text : parsed.to?.text) ?? null,
        subject,
        parsed.text?.slice(0, 10_000) ?? null,
        MessageStatus.RECEIVED,
      ],
    );

    const sender = from ? await this.resolveSender(from) : null;
    if (!sender) {
      await this.db.execute(
        `UPDATE channel_messages
            SET status = $1, error = 'UNKNOWN_SENDER', "processedAt" = now()
          WHERE id = $2`,
        [MessageStatus.PROCESSED, record.id],
      );
      if (from) {
        await this.send(
          from,
          'Dossiro: address not recognised',
          'This address is not linked to a Dossiro account. Ask an administrator to add and verify it in your profile before emailing documents in.',
        );
      }
      return { stored: 0, messageId };
    }

    // A subject line of "get <something>" is a retrieval request.
    const retrieval = /^\s*get\s+(.+)$/i.exec(subject);
    if (retrieval && (parsed.attachments?.length ?? 0) === 0) {
      await this.replyWithLink(sender, from!, retrieval[1].trim());
      await this.db.execute(
        `UPDATE channel_messages
            SET status = $1, "resolvedUserId" = $2, "processedAt" = now()
          WHERE id = $3`,
        [MessageStatus.PROCESSED, sender.id, record.id],
      );
      return { stored: 0, messageId };
    }

    const folderId = await this.inboxFolderId(sender, 'Email Inbox');
    const stored: string[] = [];

    for (const attachment of parsed.attachments ?? []) {
      // Skip inline signature images and tracking pixels.
      if (attachment.size < MIN_ATTACHMENT_BYTES) continue;
      if (attachment.contentDisposition === 'inline' && attachment.contentType?.startsWith('image/')) continue;

      const doc = await this.documents.ingest(sender, {
        buffer: attachment.content,
        originalName: attachment.filename ?? `attachment-${stored.length + 1}`,
        mimeType: attachment.contentType ?? 'application/octet-stream',
        folderId,
        description: `Received by email: ${subject}`,
        channel: ChannelType.EMAIL,
        sourceRef: from,
      });
      stored.push(doc.name);
    }

    await this.db.execute(
      `UPDATE channel_messages
          SET status = $1, "resolvedUserId" = $2, "processedAt" = now(), payload = $3
        WHERE id = $4`,
      [MessageStatus.PROCESSED, sender.id, JSON.stringify({ attachments: stored }), record.id],
    );

    if (stored.length > 0 && from) {
      await this.send(
        from,
        `Dossiro: ${stored.length} file(s) stored`,
        `Filed into your Email Inbox:\n\n${stored.map((n) => `- ${n}`).join('\n')}`,
      );
    }

    return { stored: stored.length, messageId };
  }

  /** Sends a share link in reply to a "get ..." subject line. */
  private async replyWithLink(sender: AuthUser, to: string, query: string): Promise<void> {
    const { items } = await this.search.search(sender, { q: query, take: 5 });

    if (items.length === 0) {
      await this.send(to, `Dossiro: nothing found for "${query}"`, `No documents matched "${query}".`);
      return;
    }
    if (items.length > 1) {
      await this.send(
        to,
        `Dossiro: ${items.length} matches for "${query}"`,
        `Several documents matched. Reply with a more specific name:\n\n${items.map((d) => `- ${d.name}`).join('\n')}`,
      );
      return;
    }

    const doc = items[0];
    const level = await this.access.getDocumentAccess(sender, doc.id);
    if (level === AccessLevel.NONE) {
      await this.send(to, 'Dossiro: access denied', 'You do not have access to that document.');
      return;
    }

    try {
      const { url } = await this.shares.create(sender, {
        documentId: doc.id,
        expiresInHours: 72,
        maxDownloads: 5,
        allowDownload: level !== AccessLevel.READ,
        createdVia: ChannelType.EMAIL,
      });
      await this.send(
        to,
        `Dossiro: ${doc.name}`,
        `Here is your link. It is valid for 72 hours and 5 downloads.\n\n${url}`,
      );
    } catch (err) {
      await this.send(to, 'Dossiro: cannot share that document', (err as Error).message);
    }
  }

  async send(to: string, subject: string, text: string, html?: string): Promise<void> {
    if (!this.cfg.enabled) {
      this.logger.log(`[email disabled] would send to ${to}: ${subject}`);
      return;
    }

    try {
      const info = await this.getTransporter().sendMail({
        from: this.cfg.from,
        to,
        subject,
        text,
        html,
      });

      await this.db.execute(
        `INSERT INTO channel_messages (id, channel, direction, "externalId", "toAddr", subject, body,
                                       status, "createdAt")
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [
          newId(),
          ChannelType.EMAIL,
          MessageDirection.OUTBOUND,
          info.messageId ?? null,
          to,
          subject,
          text,
          MessageStatus.SENT,
        ],
      );
    } catch (err) {
      this.logger.error(`Email send failed to ${to}`, err as Error);
      await this.db.execute(
        `INSERT INTO channel_messages (id, channel, direction, "toAddr", subject, body, status, error,
                                       "createdAt")
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [
          newId(),
          ChannelType.EMAIL,
          MessageDirection.OUTBOUND,
          to,
          subject,
          text,
          MessageStatus.FAILED,
          (err as Error).message,
        ],
      );
    }
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      this.transporter = createTransport({
        host: this.cfg.host,
        port: this.cfg.port,
        secure: this.cfg.secure,
        auth: this.cfg.user ? { user: this.cfg.user, pass: this.cfg.pass } : undefined,
      });
    }
    return this.transporter;
  }

  private async resolveSender(address: string): Promise<AuthUser | null> {
    const identity = await this.db.maybeOne<{ userId: string; verifiedAt: Date | null }>(
      `SELECT "userId", "verifiedAt" FROM channel_identities
        WHERE channel = $1 AND identifier = $2`,
      [ChannelType.EMAIL, address.toLowerCase()],
    );
    if (!identity?.verifiedAt) return null;
    return this.auth.buildAuthUser(identity.userId).catch(() => null);
  }

  private async inboxFolderId(user: AuthUser, name: string): Promise<string | null> {
    const existing = await this.db.maybeOne<{ id: string }>(
      `SELECT id FROM folders
        WHERE "organizationId" = $1 AND name = $2 AND "createdById" = $3 AND "deletedAt" IS NULL`,
      [user.organizationId, name, user.id],
    );
    if (existing) return existing.id;

    // The id is generated first so the materialised path can be written in the
    // INSERT, rather than leaving a row with a placeholder path visible to any
    // subtree query that runs in between.
    const id = newId();
    await this.db.execute(
      `INSERT INTO folders (id, "organizationId", name, path, depth, "createdById", "createdAt", "updatedAt")
            VALUES ($1, $2, $3, $4, 0, $5, now(), now())`,
      [id, user.organizationId, name, `/${id}/`, user.id],
    );
    return id;
  }
}
