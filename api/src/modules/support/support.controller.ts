import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { DatabaseService, SupportScope } from '../../common/db';
import { CurrentUser, PlatformWritable } from '../../common/decorators';
import type { AuthUser } from '../../common/types/auth.types';
import { SupportService } from './support.service';

export class RequestAccessDto {
  @IsString()
  organizationId!: string;

  @IsEnum(SupportScope)
  scope!: SupportScope;

  /** Shown to the tenant verbatim, so it has to say something. */
  @IsString()
  @MinLength(10, { message: 'Give the tenant a reason they can actually read.' })
  reason!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  hours?: number;

  /** Confirmed platform outage only. Capped at 30 minutes and reviewed after. */
  @IsOptional()
  @IsBoolean()
  breakGlass?: boolean;
}

export class ReasonDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

/**
 * Support access to a tenancy (PLT-2).
 *
 * Two audiences on one set of routes. An operator requests and revokes; the
 * tenant approves, refuses, revokes, and reads the same list. Neither is shown
 * anything the other cannot see, which is what makes the promise checkable by
 * the party it is made to.
 */
@ApiTags('support')
@Controller('support')
export class SupportController {
  constructor(
    private readonly support: SupportService,
    private readonly db: DatabaseService,
  ) {}

  @Post('sessions')
  // Writes into a tenant's realm from the platform realm, which the write
  // guard refuses by default. That default is right; this is the one route
  // that has earned an exception, and it is audited on both sides.
  @PlatformWritable()
  @ApiOperation({
    summary: 'Ask to look inside a tenancy',
    description:
      'Metadata and configuration start active. Anything reaching documents waits for a named '
      + 'person in the tenancy, unless it is break-glass — which is capped at 30 minutes and '
      + 'flagged for review.',
  })
  request(@CurrentUser() user: AuthUser, @Body() dto: RequestAccessDto) {
    return this.support.request(user, dto);
  }

  @Get('sessions')
  @ApiOperation({
    summary: 'Support access to a tenancy, past and present',
    description:
      'A tenant sees their own without passing anything. An operator passes the tenant. Both see '
      + 'the same rows.',
  })
  list(@CurrentUser() user: AuthUser, @Query('organizationId') organizationId?: string) {
    return this.support.listForTenant(user, organizationId);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'One session, with every record opened during it' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.support.get(user, id);
  }

  @Patch('sessions/:id/approve')
  @ApiOperation({ summary: 'Let the operator in (tenant only)' })
  approve(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.support.approve(user, id);
  }

  @Patch('sessions/:id/refuse')
  @ApiOperation({ summary: 'Turn the request down (tenant only)' })
  refuse(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.support.refuse(user, id, dto.reason);
  }

  @Patch('sessions/:id/revoke')
  @PlatformWritable()
  @ApiOperation({
    summary: 'End an active session',
    description:
      'Either side, immediately, and the tenant needs no reason and no permission from us.',
  })
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReasonDto) {
    return this.support.revoke(user, id, dto.reason);
  }

  /* -- What a session actually buys ------------------------------------------ */

  @Get('tenants/:organizationId/records')
  @ApiOperation({
    summary: 'A tenant’s records, seen through an active support session',
    description:
      'The only route by which an operator reads inside a tenancy, and it refuses without a live '
      + 'session of sufficient scope. Names and sizes at METADATA; opening a record needs '
      + 'DOCUMENTS, and every open is written to the tenant’s own audit trail.',
  })
  async records(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Query('take') take?: string,
  ) {
    const session = await this.support.requireSession(user, organizationId, SupportScope.METADATA);

    // Metadata means metadata. No content, no storage keys, no excerpt — the
    // scope would be a label rather than a limit if this returned the row.
    const items = await this.db.query(
      `SELECT d.id, d.name, d."mimeType", d.classification, d."updatedAt",
              f.name AS "folderName", v."sizeBytes"
         FROM documents d
         LEFT JOIN folders f ON f.id = d."folderId"
         LEFT JOIN document_versions v ON v.id = d."currentVersionId"
        WHERE d."organizationId" = $1 AND d."deletedAt" IS NULL
        ORDER BY d."updatedAt" DESC
        LIMIT $2`,
      [organizationId, Math.min(Number(take) || 50, 200)],
    );

    return { sessionId: session.id, scope: session.scope, items, total: items.length };
  }

  @Get('tenants/:organizationId/records/:documentId')
  @ApiOperation({
    summary: 'Open one of a tenant’s records',
    description:
      'Needs a DOCUMENTS session. The open is recorded against the session and written to the '
      + 'tenant’s audit trail, where their records manager sees it and can revoke on the spot.',
  })
  async record(
    @CurrentUser() user: AuthUser,
    @Param('organizationId') organizationId: string,
    @Param('documentId') documentId: string,
  ) {
    const session = await this.support.requireSession(user, organizationId, SupportScope.DOCUMENTS);

    const doc = await this.db.one<{ id: string; name: string }>(
      `SELECT d.id, d.name, d."mimeType", d.classification, i."contentText"
         FROM documents d
         LEFT JOIN document_index i ON i."documentId" = d.id
        WHERE d.id = $1 AND d."organizationId" = $2 AND d."deletedAt" IS NULL`,
      [documentId, organizationId],
    );

    await this.support.noteView(session.id, organizationId, user, doc);
    return doc;
  }
}
