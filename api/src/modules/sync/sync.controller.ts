import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import { DatabaseService, newId } from '../../common/db';
import type { AuthUser } from '../../common/types/auth.types';
import { AccessService } from '../access/access.service';

/**
 * Delta sync for offline clients (feature 12, first half).
 *
 * The client stores a cursor and asks for everything that changed since. That
 * covers offline *reading* and queued uploads, which is the realistic scope
 * for a web and mobile client.
 *
 * What this deliberately does NOT do is bidirectional offline *editing* with
 * automatic conflict resolution. That needs a version-vector or CRDT model and
 * a real desktop client, and it is the single most expensive item on the
 * feature list. Treat it as its own phase, not as an extension of this
 * endpoint. Until then, an offline edit comes back as a new version and the
 * user is shown the conflict rather than having it silently resolved.
 */
@ApiTags('sync')
@Controller('sync')
export class SyncController {
  constructor(
    private readonly db: DatabaseService,
    private readonly access: AccessService,
  ) {}

  @Get('changes')
  @ApiOperation({ summary: 'Changes since a cursor, for an offline client' })
  async changes(
    @CurrentUser() user: AuthUser,
    @Query('since') since?: string,
    @Query('limit') limit?: string,
  ) {
    const cursor = since ? BigInt(since) : 0n;
    const take = Math.min(limit ? Number(limit) : 500, 2000);

    // `seq` is bigint. node-postgres hands those back as strings so that values
    // beyond 2^53 survive, hence the explicit BigInt() rather than a cast.
    const rows = (
      await this.db.query<{
        seq: string;
        entityType: string;
        entityId: string;
        op: string;
        snapshot: unknown;
        createdAt: Date;
      }>(
        `SELECT seq, "entityType", "entityId", op, snapshot, "createdAt"
           FROM change_log
          WHERE "organizationId" = $1 AND seq > $2
          ORDER BY seq ASC
          LIMIT $3`,
        [user.organizationId, cursor.toString(), take],
      )
    ).map((r) => ({ ...r, seq: BigInt(r.seq) }));

    // The change feed is org-wide, so it has to be filtered to what this user
    // may see before it leaves the server. Skipping this would turn the sync
    // endpoint into a way to enumerate the whole repository.
    const readable = await this.access.readableFolderIds(user);
    const filtered = readable === null ? rows : await this.filterVisible(user, rows, readable);

    return {
      // Cursor advances past everything examined, including rows filtered out,
      // so a client is not served the same invisible rows on every poll.
      cursor: rows.length ? rows[rows.length - 1].seq.toString() : cursor.toString(),
      hasMore: rows.length === take,
      changes: filtered.map((c) => ({
        seq: c.seq.toString(),
        entityType: c.entityType,
        entityId: c.entityId,
        op: c.op,
        snapshot: c.snapshot,
        createdAt: c.createdAt,
      })),
    };
  }

  @Post('devices')
  @ApiOperation({ summary: 'Register an offline-capable device and its cursor' })
  async register(@CurrentUser() user: AuthUser, @Body() body: { name: string; platform: string }) {
    return this.db.one(
      `INSERT INTO devices (id, "userId", name, platform, "createdAt")
            VALUES ($1, $2, $3, $4, now())
       ON CONFLICT ("userId", name)
     DO UPDATE SET platform = EXCLUDED.platform
         RETURNING *`,
      [newId(), user.id, body.name, body.platform],
    );
  }

  @Post('devices/cursor')
  @ApiOperation({ summary: 'Acknowledge changes up to a cursor' })
  async ack(@CurrentUser() user: AuthUser, @Body() body: { name: string; seq: string }) {
    await this.db.execute(
      `UPDATE devices
          SET "lastSyncSeq" = $1, "lastSyncAt" = now()
        WHERE "userId" = $2 AND name = $3`,
      [body.seq, user.id, body.name],
    );
    return { acknowledged: true };
  }

  private async filterVisible(
    user: AuthUser,
    rows: Array<{ entityType: string; entityId: string; seq: bigint; op: string; snapshot: unknown; createdAt: Date }>,
    readableFolderIds: string[],
  ) {
    const documentIds = rows.filter((r) => r.entityType === 'document').map((r) => r.entityId);
    if (documentIds.length === 0) return rows.filter((r) => r.entityType !== 'document');

    const visible = await this.db.query<{ id: string }>(
      `SELECT id FROM documents
        WHERE id = ANY($1::text[])
          AND "organizationId" = $2
          AND ("folderId" = ANY($3::text[]) OR "ownerId" = $4)`,
      [documentIds, user.organizationId, readableFolderIds, user.id],
    );
    const allowed = new Set(visible.map((d) => d.id));

    return rows.filter((r) => r.entityType !== 'document' || allowed.has(r.entityId));
  }
}
