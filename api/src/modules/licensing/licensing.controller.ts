import { BadRequestException, Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { CurrentUser, OptionalAuth, PlatformWritable } from '../../common/decorators';
import { PlatformStaffGuard } from '../../common/guards/platform-staff.guard';
import { LicenseService } from '../../common/licensing/license.service';
import { DatabaseService } from '../../common/db';
import type { AuthUser } from '../../common/types/auth.types';

export class AttachLicenseDto {
  @IsString()
  @MinLength(40, { message: 'That does not look like a licence key' })
  licenseKey!: string;
}

@ApiTags('licensing')
@Controller()
// Issuing and attaching licences is the one thing only the platform can do.
@PlatformWritable()
export class LicensingController {
  constructor(
    private readonly license: LicenseService,
    private readonly db: DatabaseService,
  ) {}

  @Get('license')
  @ApiOperation({
    summary: 'Subscription status for the caller’s organisation',
    description: 'Drives the banner. Reads are never gated by licence state; only new records and new people are.',
  })
  status(@CurrentUser() user: AuthUser) {
    return this.license.statusFor(user.organizationId);
  }

  @OptionalAuth()
  @UseGuards(PlatformStaffGuard)
  @Get('platform/installation')
  @ApiOperation({
    summary: 'This installation’s identity',
    description: 'Quote the deploymentId when issuing an on-premise licence; it is what the licence binds to.',
  })
  installation() {
    return {
      deploymentId: this.license.getDeploymentId(),
      issueCommand: `npx tsx scripts/license.ts issue --to "<client>" --bound-to ${this.license.getDeploymentId()} --mode onprem --seats 50`,
    };
  }

  @OptionalAuth()
  @UseGuards(PlatformStaffGuard)
  @Patch('platform/organizations/:id/license')
  @ApiOperation({ summary: 'Attach a subscription to a tenant' })
  async attach(@Param('id') id: string, @Body() dto: AttachLicenseDto) {
    const org = await this.db.maybeOne<{ slug: string; name: string }>(
      'SELECT slug, name FROM organizations WHERE id = $1',
      [id],
    );
    if (!org) throw new BadRequestException('No such organisation');

    const payload = this.license.verify(dto.licenseKey);
    if (!payload) {
      throw new BadRequestException(
        'That licence could not be verified. Check it was issued by this deployment’s signing key.',
      );
    }

    // Refuse at the point of attachment rather than letting it fail silently
    // later: a licence bound to another tenant would verify, then quietly fall
    // back to the free allowance with only a log line to explain why.
    if (payload.boundTo !== org.slug) {
      throw new BadRequestException(
        `This licence is issued to "${payload.boundTo}" but ${org.name} is "${org.slug}".`,
      );
    }

    await this.db.execute(
      `UPDATE organizations
          SET "licenseKey" = $1, plan = $2, "seatLimit" = $3, "updatedAt" = now()
        WHERE id = $4`,
      // seatLimit is mirrored for display only. Enforcement reads the signature.
      [dto.licenseKey, payload.mode === 'hosted' ? 'subscription' : payload.mode, payload.seats, id],
    );

    return this.license.statusFor(id);
  }
}
