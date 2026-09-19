import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/rbac/permissions';
import type { AuthUser } from '../../common/types/auth.types';
import { CreateShareDto } from './dto/share.dto';
import { SHARE_STATUSES, SharesService, type ShareStatus } from './shares.service';

@ApiTags('shares')
@Controller('shares')
export class SharesController {
  constructor(private readonly shares: SharesService) {}

  @Get()
  @ApiOperation({
    summary: 'Share links',
    description:
      'Every link across the organisation, or just one document’s when documentId is given. Scoped to documents the caller can read — a link is a route to a record, so listing one for a document you cannot open would leak both its name and the fact that it is in circulation.',
  })
  list(
    @CurrentUser() user: AuthUser,
    @Query('documentId') documentId?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('status') status?: string,
  ) {
    if (documentId) return this.shares.listForDocument(user, documentId);

    // An unrecognised status is rejected rather than ignored: silently
    // returning everything would look like "no links are revoked".
    if (status && !SHARE_STATUSES.includes(status as ShareStatus)) {
      throw new BadRequestException(
        `status must be one of ${SHARE_STATUSES.join(', ')}`,
      );
    }

    return this.shares.listForOrganization(user, {
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
      status: status as ShareStatus | undefined,
    });
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SHARE_CREATE)
  @ApiOperation({
    summary: 'Create a share link (feature 1)',
    description:
      'Rejected when the requested settings conflict with the document classification (feature 8). Non-blocking advice comes back in `warnings`.',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateShareDto) {
    return this.shares.create(user, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke a link immediately' })
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.shares.revoke(user, id).then(() => ({ revoked: true }));
  }
}
