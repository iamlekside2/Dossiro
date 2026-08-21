import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChannelType } from '../../common/db';
import { randomInt } from 'node:crypto';
import { CurrentUser, Public } from '../../common/decorators';
import { DatabaseService, newId, paginate } from '../../common/db';
import type { AuthUser, AuthedRequest } from '../../common/types/auth.types';
import { EmailService } from './email.service';
import { WhatsAppService } from './whatsapp.service';

@ApiTags('channels')
@Controller('channels')
export class ChannelsController {
  constructor(
    private readonly whatsapp: WhatsAppService,
    private readonly email: EmailService,
    private readonly db: DatabaseService,
  ) {}

  // ---------------------------------------------------------------------------
  // WhatsApp webhooks
  // ---------------------------------------------------------------------------

  @Public()
  @Get('whatsapp/webhook')
  @ApiExcludeEndpoint()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const result = this.whatsapp.verifyWebhook(mode, token, challenge);
    if (result === null) throw new ForbiddenException('Verification failed');
    return result;
  }

  @Public()
  @Post('whatsapp/webhook')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async receive(@Req() req: AuthedRequest, @Body() body: unknown) {
    if (!this.whatsapp.verifySignature(req.rawBody, req.headers['x-hub-signature-256'] as string)) {
      throw new ForbiddenException('Invalid signature');
    }

    // Acknowledge immediately and process out of band. Meta retries anything
    // it does not see a 200 for within seconds, and media download is slow.
    void this.whatsapp.handleWebhook(body as Parameters<WhatsAppService['handleWebhook']>[0]);
    return { received: true };
  }

  // ---------------------------------------------------------------------------
  // Inbound email
  // ---------------------------------------------------------------------------

  @Public()
  @Post('email/inbound')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('message'))
  @ApiOperation({
    summary: 'Inbound mail webhook',
    description:
      'Accepts the raw MIME message either as the request body (Content-Type: message/rfc822) or as a "message" file field. Authenticated by the ?secret= query parameter.',
  })
  async inboundEmail(
    @Query('secret') secret: string,
    @Req() req: AuthedRequest,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    this.email.assertInboundSecret(secret);

    const raw = file?.buffer ?? req.rawBody;
    if (!raw?.length) {
      throw new BadRequestException('No MIME message found in the request');
    }
    return this.email.handleInbound(raw);
  }

  // ---------------------------------------------------------------------------
  // Identity linking
  // ---------------------------------------------------------------------------

  @Post('identities')
  @ApiOperation({
    summary: 'Claim a phone number or email address for the current user',
    description:
      'Creates an unverified identity and issues a code. Until it is verified, messages from that address are refused.',
  })
  async claim(
    @CurrentUser() user: AuthUser,
    @Body() body: { channel: ChannelType; identifier: string },
  ) {
    if (!body?.identifier) throw new BadRequestException('identifier is required');

    const identifier =
      body.channel === ChannelType.WHATSAPP
        ? `+${body.identifier.replace(/[^\d]/g, '')}`
        : body.identifier.trim().toLowerCase();

    // randomInt is drawn from the CSPRNG; Math.random would be guessable.
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');

    // Re-claiming clears verifiedAt: an address moving to a different user must
    // not carry the previous owner's verification with it.
    const identity = await this.db.one<{ id: string; channel: ChannelType }>(
      `INSERT INTO channel_identities (id, "userId", channel, identifier, "verifyCode", "createdAt")
            VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (channel, identifier)
     DO UPDATE SET "userId" = EXCLUDED."userId",
                   "verifyCode" = EXCLUDED."verifyCode",
                   "verifiedAt" = NULL
         RETURNING id, channel`,
      [newId(), user.id, body.channel, identifier, code],
    );

    if (body.channel === ChannelType.WHATSAPP) {
      await this.whatsapp.sendText(identifier, `Your Dossiro verification code is ${code}`);
    } else {
      await this.email.send(identifier, 'Dossiro verification code', `Your verification code is ${code}`);
    }

    return { id: identity.id, channel: identity.channel, identifier, verified: false };
  }

  @Post('identities/verify')
  @ApiOperation({ summary: 'Confirm ownership with the emailed or messaged code' })
  async verifyIdentity(
    @CurrentUser() user: AuthUser,
    @Body() body: { channel: ChannelType; identifier: string; code: string },
  ) {
    const identifier =
      body.channel === ChannelType.WHATSAPP
        ? `+${body.identifier.replace(/[^\d]/g, '')}`
        : body.identifier.trim().toLowerCase();

    const identity = await this.db.maybeOne<{
      id: string;
      userId: string | null;
      verifyCode: string | null;
    }>(
      `SELECT id, "userId", "verifyCode" FROM channel_identities
        WHERE channel = $1 AND identifier = $2`,
      [body.channel, identifier],
    );

    if (!identity || identity.userId !== user.id || !identity.verifyCode || identity.verifyCode !== body.code) {
      throw new ForbiddenException('Invalid verification code');
    }

    await this.db.execute(
      `UPDATE channel_identities SET "verifiedAt" = now(), "verifyCode" = NULL WHERE id = $1`,
      [identity.id],
    );

    return { verified: true };
  }

  @Get('identities')
  @ApiOperation({ summary: 'Addresses linked to the current user' })
  listIdentities(@CurrentUser() user: AuthUser) {
    return this.db.query(
      `SELECT id, channel, identifier, "verifiedAt", "createdAt"
         FROM channel_identities
        WHERE "userId" = $1`,
      [user.id],
    );
  }

  @Get('messages')
  @ApiOperation({ summary: 'Channel activity feed, backing the Inbox screen' })
  messages(@CurrentUser() user: AuthUser, @Query('channel') channel?: ChannelType, @Query('take') take?: string) {
    const page = paginate(take ? Number(take) : 50, 0);

    return this.db.query(
      `SELECT m.*,
              CASE WHEN d.id IS NULL THEN NULL ELSE
                json_build_object('id', d.id, 'name', d.name, 'mimeType', d."mimeType")
              END AS document
         FROM channel_messages m
         LEFT JOIN documents d ON d.id = m."documentId"
        WHERE ($1::"ChannelType" IS NULL OR m.channel = $1)
          AND (m."organizationId" = $2 OR m."resolvedUserId" = $3)
        ORDER BY m."createdAt" DESC
        ${page.text}`,
      [channel ?? null, user.organizationId, user.id],
    );
  }
}
