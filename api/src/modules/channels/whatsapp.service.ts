import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessLevel, ChannelType, MessageDirection, MessageStatus } from '../../common/db';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AppConfig } from '../../common/config/configuration';
import { DatabaseService, newId } from '../../common/db';
import type { AuthUser } from '../../common/types/auth.types';
import { AccessService } from '../access/access.service';
import { AuthService } from '../auth/auth.service';
import { DocumentsService } from '../documents/documents.service';
import { SearchService } from '../search/search.service';
import { SharesService } from '../shares/shares.service';

/** Media types Meta delivers with a downloadable id. */
const MEDIA_TYPES = ['document', 'image', 'audio', 'video'] as const;
type MediaType = (typeof MEDIA_TYPES)[number];

interface WhatsAppMedia {
  id: string;
  mime_type?: string;
  filename?: string;
  sha256?: string;
}

interface WhatsAppMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  document?: WhatsAppMedia;
  image?: WhatsAppMedia;
  audio?: WhatsAppMedia;
  video?: WhatsAppMedia;
}

interface WhatsAppWebhookBody {
  object?: string;
  entry?: Array<{
    id: string;
    changes?: Array<{
      field: string;
      value: {
        messaging_product?: string;
        metadata?: { phone_number_id: string };
        messages?: WhatsAppMessage[];
        statuses?: Array<{ id: string; status: string }>;
      };
    }>;
  }>;
}

/**
 * WhatsApp Cloud API channel (original feature 2).
 *
 * Upload:   send a file to the business number -> it is filed as a document.
 * Download: send "get <text>" -> you receive a time-limited share link.
 *
 * The security position that matters: a phone number is only trusted once it
 * has been claimed by a user through a verified ChannelIdentity. Without that
 * rule, anyone who learns the business number could pull documents out of the
 * repository just by asking.
 */
@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

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
    return this.config.get('app', { infer: true }).whatsapp;
  }

  /** Meta's GET handshake when you save the webhook URL. */
  verifyWebhook(mode?: string, token?: string, challenge?: string): string | null {
    if (mode === 'subscribe' && token && this.cfg.verifyToken && token === this.cfg.verifyToken) {
      return challenge ?? '';
    }
    return null;
  }

  /**
   * Validates X-Hub-Signature-256 over the exact raw bytes Meta sent.
   *
   * Must run against the raw buffer, not the parsed-and-restringified body:
   * JSON.stringify does not reproduce the original byte-for-byte, so key
   * order or unicode escaping would break an otherwise valid signature.
   */
  verifySignature(rawBody: Buffer | undefined, header: string | undefined): boolean {
    if (!this.cfg.appSecret) {
      // Refuse rather than wave it through - an unverified webhook is an open
      // door for anyone who guesses the URL.
      this.logger.error('WHATSAPP_APP_SECRET is not set; rejecting webhook');
      return false;
    }
    if (!rawBody || !header?.startsWith('sha256=')) return false;

    const expected = createHmac('sha256', this.cfg.appSecret).update(rawBody).digest('hex');
    const a = Buffer.from(header.slice('sha256='.length), 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async handleWebhook(body: WhatsAppWebhookBody): Promise<void> {
    const messages =
      body.entry?.flatMap((e) => e.changes?.flatMap((c) => c.value?.messages ?? []) ?? []) ?? [];

    for (const message of messages) {
      try {
        await this.handleMessage(message);
      } catch (err) {
        this.logger.error(`Failed handling WhatsApp message ${message.id}`, err as Error);
        await this.markFailed(message.id, (err as Error).message);
      }
    }
  }

  // ---------------------------------------------------------------------------

  private async handleMessage(message: WhatsAppMessage): Promise<void> {
    // Meta retries deliveries. The unique (channel, externalId) index makes the
    // second attempt a no-op instead of a duplicate document.
    const existing = await this.db.maybeOne<{ id: string }>(
      `SELECT id FROM channel_messages WHERE channel = $1 AND "externalId" = $2`,
      [ChannelType.WHATSAPP, message.id],
    );
    if (existing) {
      this.logger.debug(`Ignoring duplicate WhatsApp message ${message.id}`);
      return;
    }

    const record = await this.db.one<{ id: string }>(
      `INSERT INTO channel_messages (id, channel, direction, "externalId", "fromAddr", body,
                                     payload, status, "createdAt")
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         RETURNING id`,
      [
        newId(),
        ChannelType.WHATSAPP,
        MessageDirection.INBOUND,
        message.id,
        message.from,
        message.text?.body ?? null,
        JSON.stringify(message),
        MessageStatus.RECEIVED,
      ],
    );

    const sender = await this.resolveSender(message.from);
    if (!sender) {
      await this.sendText(
        message.from,
        'This number is not linked to a Dossiro account. Ask an administrator to add and verify it in your profile before sending or requesting documents.',
      );
      await this.db.execute(
        `UPDATE channel_messages
            SET status = $1, error = 'UNKNOWN_SENDER', "processedAt" = now()
          WHERE id = $2`,
        [MessageStatus.PROCESSED, record.id],
      );
      return;
    }

    const mediaType = MEDIA_TYPES.find((t) => message[t]);
    if (mediaType) {
      await this.handleIncomingMedia(sender, message, mediaType, record.id);
    } else if (message.text?.body) {
      await this.handleCommand(sender, message.from, message.text.body, record.id);
    } else {
      await this.sendText(message.from, 'Send a file to store it, or "get <name>" to retrieve one. Send "help" for the full list.');
      await this.db.execute(
        `UPDATE channel_messages SET status = $1, "processedAt" = now() WHERE id = $2`,
        [MessageStatus.PROCESSED, record.id],
      );
    }
  }

  /** Uploads an inbound attachment into the sender's WhatsApp inbox folder. */
  private async handleIncomingMedia(
    sender: AuthUser,
    message: WhatsAppMessage,
    type: MediaType,
    recordId: string,
  ): Promise<void> {
    const media = message[type]!;
    const { buffer, mimeType } = await this.downloadMedia(media.id);

    const filename = media.filename ?? `whatsapp-${type}-${message.id.slice(-8)}${extensionFor(mimeType)}`;
    const folderId = await this.inboxFolderId(sender, 'WhatsApp Inbox');

    const doc = await this.documents.ingest(sender, {
      buffer,
      originalName: filename,
      mimeType: media.mime_type ?? mimeType,
      folderId,
      channel: ChannelType.WHATSAPP,
      sourceRef: message.from,
    });

    await this.db.execute(
      `UPDATE channel_messages
          SET status = $1, "documentId" = $2, "resolvedUserId" = $3, "processedAt" = now()
        WHERE id = $4`,
      [MessageStatus.PROCESSED, doc.id, sender.id, recordId],
    );

    await this.sendText(message.from, `Saved "${doc.name}" to your WhatsApp Inbox.`);
  }

  /** Text commands: help, get <query>, recent. */
  private async handleCommand(sender: AuthUser, from: string, text: string, recordId: string): Promise<void> {
    const trimmed = text.trim();
    const [command, ...rest] = trimmed.split(/\s+/);
    const argument = rest.join(' ');

    switch (command.toLowerCase()) {
      case 'help':
        await this.sendText(
          from,
          [
            'Dossiro commands:',
            '- Send any file to store it.',
            '- get <name> : search and receive a time-limited link',
            '- recent : your five most recent documents',
          ].join('\n'),
        );
        break;

      case 'get': {
        if (!argument) {
          await this.sendText(from, 'Tell me what to look for, for example: get invoice March');
          break;
        }
        await this.sendMatchingLink(sender, from, argument);
        break;
      }

      case 'recent': {
        const { items } = await this.documents.list(sender, { take: 5 });
        if (items.length === 0) {
          await this.sendText(from, 'You have no documents yet.');
          break;
        }
        await this.sendText(from, ['Your recent documents:', ...items.map((d, i) => `${i + 1}. ${d.name}`)].join('\n'));
        break;
      }

      default:
        await this.sendText(from, 'I did not recognise that. Send "help" for the list of commands.');
    }

    await this.db.execute(
      `UPDATE channel_messages
          SET status = $1, "resolvedUserId" = $2, "processedAt" = now()
        WHERE id = $3`,
      [MessageStatus.PROCESSED, sender.id, recordId],
    );
  }

  /**
   * Finds a document and replies with a share link.
   *
   * The link is short-lived and download-capped because it is travelling over
   * a consumer messaging app that the recipient may well have signed into on
   * a shared device.
   */
  private async sendMatchingLink(sender: AuthUser, from: string, query: string): Promise<void> {
    const { items } = await this.search.search(sender, { q: query, take: 5 });

    if (items.length === 0) {
      await this.sendText(from, `Nothing found for "${query}".`);
      return;
    }

    if (items.length > 1) {
      await this.sendText(
        from,
        [`${items.length} matches for "${query}". Reply with a more specific name:`, ...items.map((d) => `- ${d.name}`)].join('\n'),
      );
      return;
    }

    const doc = items[0];

    // The share is created as the requesting user, so their own access level
    // is what limits it. A viewer cannot mint a download link this way.
    const level = await this.access.getDocumentAccess(sender, doc.id);
    if (level === AccessLevel.NONE) {
      await this.sendText(from, 'You do not have access to that document.');
      return;
    }

    try {
      const { url } = await this.shares.create(sender, {
        documentId: doc.id,
        expiresInHours: 24,
        maxDownloads: 3,
        allowDownload: level !== AccessLevel.READ,
        createdVia: ChannelType.WHATSAPP,
      });
      await this.sendText(from, `${doc.name}\n${url}\n\nValid for 24 hours, 3 downloads.`);
    } catch (err) {
      // Feature 8 can legitimately refuse this - relay the reason rather than
      // failing silently.
      await this.sendText(from, `Cannot share that document: ${(err as Error).message}`);
    }
  }

  /** Two-step media fetch: resolve the id to a URL, then download it. */
  private async downloadMedia(mediaId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const base = `https://graph.facebook.com/${this.cfg.graphVersion}`;
    const headers = { Authorization: `Bearer ${this.cfg.accessToken}` };

    const metaRes = await fetch(`${base}/${mediaId}`, { headers });
    if (!metaRes.ok) throw new Error(`WhatsApp media lookup failed: ${metaRes.status}`);
    const meta = (await metaRes.json()) as { url: string; mime_type: string };

    const fileRes = await fetch(meta.url, { headers });
    if (!fileRes.ok) throw new Error(`WhatsApp media download failed: ${fileRes.status}`);

    return {
      buffer: Buffer.from(await fileRes.arrayBuffer()),
      mimeType: meta.mime_type ?? 'application/octet-stream',
    };
  }

  async sendText(to: string, body: string): Promise<void> {
    if (!this.cfg.enabled) {
      this.logger.log(`[whatsapp disabled] would send to ${to}: ${body}`);
      return;
    }

    const url = `https://graph.facebook.com/${this.cfg.graphVersion}/${this.cfg.phoneNumberId}/messages`;
    const payload = { messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: true, body } };

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.cfg.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await res.json()) as { messages?: Array<{ id: string }>; error?: unknown };

      await this.db.execute(
        `INSERT INTO channel_messages (id, channel, direction, "externalId", "toAddr", body,
                                       status, error, payload, "createdAt")
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
        [
          newId(),
          ChannelType.WHATSAPP,
          MessageDirection.OUTBOUND,
          result.messages?.[0]?.id ?? null,
          to,
          body,
          res.ok ? MessageStatus.SENT : MessageStatus.FAILED,
          res.ok ? null : JSON.stringify(result.error ?? result),
          JSON.stringify(result),
        ],
      );
    } catch (err) {
      this.logger.error(`WhatsApp send failed to ${to}`, err as Error);
    }
  }

  /**
   * Maps a phone number to a user via a VERIFIED ChannelIdentity.
   * An unverified row deliberately does not count.
   */
  private async resolveSender(phone: string): Promise<AuthUser | null> {
    const identity = await this.db.maybeOne<{ userId: string; verifiedAt: Date | null }>(
      `SELECT "userId", "verifiedAt" FROM channel_identities
        WHERE channel = $1 AND identifier = $2`,
      [ChannelType.WHATSAPP, normalisePhone(phone)],
    );
    if (!identity?.verifiedAt) return null;
    return this.auth.buildAuthUser(identity.userId).catch(() => null);
  }

  /** Finds or creates the per-user landing folder for this channel. */
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

  private async markFailed(externalId: string, error: string): Promise<void> {
    await this.db
      .execute(
        `UPDATE channel_messages SET status = $1, error = $2
          WHERE channel = $3 AND "externalId" = $4`,
        [MessageStatus.FAILED, error, ChannelType.WHATSAPP, externalId],
      )
      .catch(() => undefined);
  }
}

/** Meta sends digits only; store one canonical form so lookups match. */
function normalisePhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  return `+${digits}`;
}

function extensionFor(mime: string): string {
  const map: Record<string, string> = {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'video/mp4': '.mp4',
  };
  return map[mime] ?? '';
}
