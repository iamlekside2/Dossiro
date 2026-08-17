import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { OrgStatus } from '../../common/db';
import type { JsonValue } from '../audit/audit.service';
import { CurrentUser, OptionalAuth, PlatformWritable, Public, RequirePermissions } from '../../common/decorators';
import { PlatformStaffGuard } from '../../common/guards/platform-staff.guard';
import { PERMISSIONS } from '../../common/rbac/permissions';
import type { AuthUser } from '../../common/types/auth.types';
import { AddDomainDto, AddHostnameDto, ProvisionOrgDto, SetStatusDto, UpdateSettingsDto } from './dto/organizations.dto';
import { HostnamesService } from './hostnames.service';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@Controller()
// Tenant lifecycle, plus the platform realm's own settings and hostname.
@PlatformWritable()
export class OrganizationsController {
  constructor(
    private readonly orgs: OrganizationsService,
    private readonly hostnames: HostnamesService,
  ) {}

  // -- Platform realm: tenant lifecycle -------------------------------------
  // @OptionalAuth rather than @Public: these accept either a signed-in operator
  // or the bootstrap key, so the JWT must still be parsed when one is present.
  // @Public would skip it and every operator would arrive anonymous.

  @OptionalAuth()
  @UseGuards(PlatformStaffGuard)
  @Post('platform/organizations')
  @ApiOperation({
    summary: 'Provision a tenant and invite its first administrator',
    description:
      'Calm Global runs one deployment and creates a tenant per client after a sale. Requires platform staff, or the x-platform-key bootstrap header.',
  })
  provision(@Body() dto: ProvisionOrgDto, @CurrentUser() actor?: AuthUser) {
    // Named when an operator is signed in; the bootstrap key is anonymous.
    return this.orgs.provision(dto, actor?.email ?? 'bootstrap-key', actor);
  }

  @OptionalAuth()
  @UseGuards(PlatformStaffGuard)
  @Get('platform/organizations')
  @ApiOperation({ summary: 'Every tenant, with seat and document counts' })
  list() {
    return this.orgs.list();
  }

  @OptionalAuth()
  @UseGuards(PlatformStaffGuard)
  @Patch('platform/organizations/:id/status')
  @ApiOperation({
    summary: 'Change a tenantâ€™s commercial status',
    description:
      'Suspending revokes every session immediately. Documents are untouched. Suspending or closing requires a reason, which is written to the audit trail of both the tenant and the platform.',
  })
  setStatus(@Param('id') id: string, @Body() dto: SetStatusDto, @CurrentUser() actor?: AuthUser) {
    return this.orgs.setStatus({
      organizationId: id,
      status: dto.status as OrgStatus,
      actorLabel: actor?.email ?? 'bootstrap-key',
      actor,
      reason: dto.reason,
    });
  }

  // -- Inside a tenant -------------------------------------------------------

  @Get('organization')
  @ApiOperation({ summary: 'The callerâ€™s own organisation' })
  current(@CurrentUser() user: AuthUser) {
    return this.orgs.current(user.organizationId);
  }

  @Patch('organization/settings')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Tenant settings and white-label branding' })
  updateSettings(@CurrentUser() user: AuthUser, @Body() dto: UpdateSettingsDto) {
    // class-validator can only assert "an object". The DTO has already proven
    // the shape is a plain object, which is what the jsonb column needs.
    return this.orgs.updateSettings(user.organizationId, dto.settings as JsonValue, user.id);
  }

  // -- Custom web addresses --------------------------------------------------

  @Get('organization/hostnames')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Web addresses this tenant is reachable on' })
  listHostnames(@CurrentUser() user: AuthUser) {
    return this.hostnames.list(user);
  }

  @Post('organization/hostnames')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({
    summary: 'Add a custom web address',
    description: 'Unverified hostnames never resolve — they select a tenant before anyone has signed in.',
  })
  addHostname(@CurrentUser() user: AuthUser, @Body() dto: AddHostnameDto) {
    return this.hostnames.add(user, dto.hostname);
  }

  @Post('organization/hostnames/:id/verify')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Confirm ownership; the first verified address becomes primary' })
  verifyHostname(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.hostnames.verify(user, id);
  }

  @Post('organization/hostnames/:id/primary')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Make this the address share links and invitations are built from' })
  primaryHostname(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.hostnames.setPrimary(user, id);
  }

  @Delete('organization/hostnames/:id')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Remove a web address' })
  removeHostname(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.hostnames.remove(user, id);
  }

  /** Lets the sign-in page brand itself before anyone has authenticated. */
  @Public()
  @Get('tenant/by-host')
  @ApiOperation({ summary: 'Which tenant does this hostname belong to?' })
  async byHost(@Req() req: { headers: Record<string, string | undefined> }) {
    return (await this.hostnames.resolveByHost(req.headers.host)) ?? { organizationId: null };
  }

  @Post('organization/domains')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({
    summary: 'Claim an email domain so staff resolve to this tenant at sign-in',
    description: 'Requires a DNS TXT record before it resolves. Public email providers are refused.',
  })
  addDomain(@CurrentUser() user: AuthUser, @Body() dto: AddDomainDto) {
    return this.orgs.addDomain(user.organizationId, dto.domain, user.id);
  }
}
