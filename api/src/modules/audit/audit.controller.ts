import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditAction } from '../../common/db';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/rbac/permissions';
import type { AuthUser } from '../../common/types/auth.types';
import { AuditService } from './audit.service';

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @ApiOperation({ summary: 'Query the audit trail (feature 10)' })
  query(
    @CurrentUser() user: AuthUser,
    @Query('actorId') actorId?: string,
    @Query('action') action?: AuditAction,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.audit.query(user.organizationId, {
      actorId,
      action,
      resourceType,
      resourceId,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Get('integrity')
  @RequirePermissions(PERMISSIONS.AUDIT_EXPORT)
  @ApiOperation({
    summary: 'Verify the audit hash chain',
    description:
      'Recomputes every hash and reports the first row that does not match. Evidence for SOC 2 / HIPAA that the trail has not been altered.',
  })
  verify(@CurrentUser() user: AuthUser) {
    return this.audit.verifyChain(user.organizationId);
  }

  @Get('resource/:type/:id')
  @RequirePermissions(PERMISSIONS.AUDIT_READ)
  @ApiOperation({ summary: 'Full history for one document or folder' })
  forResource(
    @CurrentUser() user: AuthUser,
    @Param('type') type: string,
    @Param('id') id: string,
    @Query('take') take?: string,
  ) {
    return this.audit.query(user.organizationId, {
      resourceType: type,
      resourceId: id,
      take: take ? Number(take) : 100,
    });
  }
}
