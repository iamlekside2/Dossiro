import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/rbac/permissions';
import type { AuthUser } from '../../common/types/auth.types';
import { RetentionService, type Decision } from './retention.service';

export class DecisionDto {
  @IsIn(['KEEP', 'DESTROY', 'TRANSFER'])
  decision!: Decision;

  /**
   * Required, and not merely by the validator: a disposition with no stated
   * reason is not a decision anybody can answer for a year later.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

/**
 * The retention review queue (GOV-6, GOV-7, GOV-8).
 *
 * Reading the queue is records work; deciding is governance, so disposition
 * sits behind SETTINGS_MANAGE. Neither destroys anything directly — a DESTROY
 * decision sends the document to the recycle bin and the nightly purge does
 * the rest, still checking the hold and the recovery window.
 */
@ApiTags('retention')
@Controller('retention')
export class RetentionController {
  constructor(private readonly retention: RetentionService) {}

  @Get('policies')
  @ApiOperation({
    summary: 'Retention schedules defined by this tenant (GOV-6)',
    description:
      'With how many types and documents each one governs. A schedule attached to nothing will '
      + 'never fire, and the count is what shows it.',
  })
  policies(@CurrentUser() user: AuthUser) {
    return this.retention.policies(user);
  }

  @Get('due')
  @ApiOperation({
    summary: 'Documents whose retention period has elapsed (GOV-7)',
    description:
      'A review queue, not a deletion list. Documents under legal hold are listed with their '
      + 'hold rather than hidden, because an unexplained queue that will not clear is worse '
      + 'than a long one.',
  })
  @ApiQuery({ name: 'take', required: false })
  @ApiQuery({ name: 'skip', required: false })
  due(@CurrentUser() user: AuthUser, @Query('take') take?: string, @Query('skip') skip?: string) {
    return this.retention.due(user, {
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'What falls due inside a window, for planning' })
  @ApiQuery({ name: 'days', required: false, description: 'Defaults to 90.' })
  upcoming(@CurrentUser() user: AuthUser, @Query('days') days?: string) {
    return this.retention.upcoming(user, days ? Number(days) : undefined);
  }

  @Get('history')
  @ApiOperation({ summary: 'Dispositions already decided, for a compliance report (GOV-10)' })
  history(@CurrentUser() user: AuthUser, @Query('take') take?: string) {
    return this.retention.history(user, { take: take ? Number(take) : undefined });
  }

  @Get('document/:id')
  @ApiOperation({ summary: 'One document’s schedule, and whether it is held' })
  forDocument(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.retention.forDocument(user, id);
  }

  @Post('document/:id/decide')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({
    summary: 'Record what happens to a document whose period has elapsed (GOV-7)',
    description:
      'Refused under legal hold: a hold outranks retention, an owner and an administrator. '
      + 'DESTROY sends the document to the recycle bin, where the existing recovery window '
      + 'and purge job apply — nothing here removes bytes.',
  })
  decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.retention.decide(user, id, dto.decision, dto.reason);
  }
}
