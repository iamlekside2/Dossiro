import { BadRequestException, Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccessLevel, DatabaseService, newId, paginate } from '../../common/db';
import { ClientIp, CurrentUser, Public } from '../../common/decorators';
import type { AuthUser } from '../../common/types/auth.types';
import { AccessService } from '../access/access.service';

interface PageView {
  pageNumber: number;
  dwellMs: number;
}

interface SessionRow {
  id: string;
  userId: string | null;
  viewerEmail: string | null;
  displayName: string | null;
  startedAt: Date;
  endedAt: Date | null;
  totalMs: number;
  completed: boolean;
  pageViews: PageView[];
}

/**
 * Reading analytics (feature 23): how long each recipient spent on each page.
 *
 * The viewer posts a heartbeat as the reader moves through the document. This
 * only works with the in-app pdf.js viewer - the browser's built-in PDF plugin
 * reports nothing, so a document opened via the native viewer will show a
 * session with no page data. Worth knowing before promising this to a client.
 */
@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly db: DatabaseService,
    private readonly access: AccessService,
  ) {}

  @Public()
  @Post('sessions')
  @ApiOperation({ summary: 'Open a reading session (called by the viewer)' })
  async start(
    @Body() body: { documentId: string; shareToken?: string; viewerEmail?: string },
    @ClientIp() ip: string,
  ) {
    if (!body?.documentId) throw new BadRequestException('documentId is required');

    let shareLinkId: string | null = null;
    if (body.shareToken) {
      const share = await this.db.maybeOne<{
        id: string;
        documentId: string;
        revokedAt: Date | null;
        expiresAt: Date | null;
      }>(
        `SELECT id, "documentId", "revokedAt", "expiresAt" FROM share_links WHERE token = $1`,
        [body.shareToken],
      );
      // Only accept a session against a link that is genuinely live and points
      // at the claimed document, or the endpoint becomes a way to fabricate
      // read receipts for arbitrary documents.
      const live = share && !share.revokedAt && (!share.expiresAt || share.expiresAt > new Date());
      if (!live || share.documentId !== body.documentId) {
        throw new BadRequestException('Invalid share token');
      }
      shareLinkId = share.id;
    } else {
      throw new BadRequestException('A share token is required to open an anonymous session');
    }

    const session = await this.db.one<{ id: string }>(
      `INSERT INTO document_view_sessions (id, "documentId", "shareLinkId", "viewerEmail", ip, "startedAt")
            VALUES ($1, $2, $3, $4, $5, now())
         RETURNING id`,
      [newId(), body.documentId, shareLinkId, body.viewerEmail?.toLowerCase() ?? null, ip],
    );
    return { sessionId: session.id };
  }

  @Public()
  @Post('sessions/:id/pages')
  @ApiOperation({ summary: 'Report dwell time for a page' })
  async page(@Param('id') id: string, @Body() body: { pageNumber: number; dwellMs: number }) {
    if (!body?.pageNumber || body.dwellMs == null) {
      throw new BadRequestException('pageNumber and dwellMs are required');
    }
    // Clamp: a tab left open overnight should not register as 8 hours of
    // engaged reading, and a negative value is always a client bug.
    const dwellMs = Math.max(0, Math.min(body.dwellMs, 10 * 60 * 1000));

    // Both writes or neither: a page view whose dwell never reached the
    // session total would quietly under-report every report built on it.
    await this.db.transaction(async () => {
      await this.db.execute(
        `INSERT INTO page_views (id, "sessionId", "pageNumber", "dwellMs", "viewedAt")
              VALUES ($1, $2, $3, $4, now())`,
        [newId(), id, body.pageNumber, dwellMs],
      );
      await this.db.execute(
        `UPDATE document_view_sessions SET "totalMs" = "totalMs" + $1 WHERE id = $2`,
        [dwellMs, id],
      );
    });

    return { recorded: true };
  }

  @Public()
  @Post('sessions/:id/close')
  @ApiOperation({ summary: 'Close a reading session' })
  async close(@Param('id') id: string, @Body() body: { completed?: boolean }) {
    await this.db.execute(
      `UPDATE document_view_sessions SET "endedAt" = now(), completed = $1 WHERE id = $2`,
      [body?.completed ?? false, id],
    );
    return { closed: true };
  }

  @Get('documents/:id')
  @ApiOperation({ summary: 'Engagement report for a document (feature 23)' })
  async report(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query('take') take?: string) {
    await this.access.assertDocument(user, id, AccessLevel.READ);

    const page = paginate(take ? Number(take) : 50, 0);

    // Page views are aggregated into a JSON array per session rather than
    // fetched separately: one round trip, and the rows cannot arrive split
    // across a page boundary the way a second query's would.
    const sessions = await this.db.query<SessionRow>(
      `SELECT s.id, s."userId", s."viewerEmail", s."startedAt", s."endedAt",
              s."totalMs", s.completed,
              u."displayName",
              COALESCE(pv.views, '[]'::json) AS "pageViews"
         FROM document_view_sessions s
         LEFT JOIN users u ON u.id = s."userId"
         LEFT JOIN LATERAL (
                SELECT json_agg(json_build_object('pageNumber', p."pageNumber", 'dwellMs', p."dwellMs")
                                ORDER BY p."pageNumber") AS views
                  FROM page_views p
                 WHERE p."sessionId" = s.id
              ) pv ON TRUE
        WHERE s."documentId" = $1
        ORDER BY s."startedAt" DESC
        ${page.text}`,
      [id],
    );

    // Aggregate dwell per page across every session, so the owner can see
    // which page readers actually stop on.
    const perPage = new Map<number, { totalMs: number; views: number }>();
    for (const s of sessions) {
      for (const p of s.pageViews) {
        const entry = perPage.get(p.pageNumber) ?? { totalMs: 0, views: 0 };
        entry.totalMs += p.dwellMs;
        entry.views += 1;
        perPage.set(p.pageNumber, entry);
      }
    }

    return {
      sessions: sessions.map((s) => ({
        id: s.id,
        viewer: s.displayName ?? s.viewerEmail ?? 'Anonymous',
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        totalMs: s.totalMs,
        completed: s.completed,
        pagesRead: s.pageViews.length,
      })),
      pageBreakdown: [...perPage.entries()]
        .map(([pageNumber, v]) => ({
          pageNumber,
          totalMs: v.totalMs,
          views: v.views,
          averageMs: Math.round(v.totalMs / v.views),
        }))
        .sort((a, b) => a.pageNumber - b.pageNumber),
      totals: {
        sessions: sessions.length,
        uniqueViewers: new Set(sessions.map((s) => s.userId ?? s.viewerEmail)).size,
        totalMs: sessions.reduce((sum, s) => sum + s.totalMs, 0),
      },
    };
  }
}
