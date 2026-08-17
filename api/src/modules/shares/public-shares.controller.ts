import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { ClientIp, Public } from '../../common/decorators';
import type { AuthedRequest } from '../../common/types/auth.types';
import { AuthorizeShareDto } from './dto/share.dto';
import { SharesService } from './shares.service';

/**
 * Unauthenticated endpoints backing a share link.
 *
 * Every route here is reachable by anyone on the internet holding a token, so
 * the whole controller is rate limited and returns the narrowest useful
 * response. Nothing here may leak organisation structure.
 */
@ApiTags('public-shares')
@Public()
@Controller('public/shares')
export class PublicSharesController {
  constructor(private readonly shares: SharesService) {}

  @Get(':token')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Share metadata for the landing page' })
  meta(@Param('token') token: string) {
    return this.shares.getPublicMeta(token);
  }

  @Post(':token/authorize')
  @HttpCode(200)
  // Tight limit: this is the endpoint an attacker would use to brute-force
  // a 4-character access code.
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Exchange the access code for a short-lived download ticket',
    description:
      'Two-step by design: the access code is POSTed and never appears in a URL, where it would leak into history, proxy logs and the Referer header.',
  })
  authorize(
    @Param('token') token: string,
    @Body() dto: AuthorizeShareDto,
    @Req() req: AuthedRequest,
    @ClientIp() ip: string,
  ) {
    return this.shares.authorize(token, dto, { ip, userAgent: req.headers['user-agent'] });
  }

  @Get(':token/content')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Stream the shared bytes using a ticket' })
  async content(
    @Param('token') token: string,
    @Query('ticket') ticket: string,
    @Res({ passthrough: false }) res: Response,
    @Req() req: AuthedRequest,
    @ClientIp() ip: string,
    @Query('disposition') disposition?: string,
  ) {
    const wantsAttachment = disposition === 'attachment';

    const { stream, filename, mimeType, size } = await this.shares.openPublicContent(
      token,
      ticket,
      wantsAttachment,
      { ip, userAgent: req.headers['user-agent'] },
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(size));
    res.setHeader(
      'Content-Disposition',
      `${wantsAttachment ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(filename)}`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    // A shared document must never be framed by a third-party site.
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }
}
