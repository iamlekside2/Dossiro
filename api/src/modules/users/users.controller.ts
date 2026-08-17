import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserStatus, UserTier } from '../../common/db';
import { CurrentUser, PlatformWritable, Public, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/rbac/permissions';
import type { AuthUser } from '../../common/types/auth.types';
import { AcceptInviteDto, ChangeTierDto, InviteUserDto } from './dto/users.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller()
// Operators add and manage fellow operators - staff administration is the platform realm's job.
@PlatformWritable()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // -- Inside a tenant -------------------------------------------------------

  @Get('users')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'People in this organisation (Administration › Personnel)' })
  list(
    @CurrentUser() user: AuthUser,
    @Query('q') query?: string,
    @Query('status') status?: UserStatus,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.users.list(user, {
      query,
      status,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Post('users/invite')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({
    summary: 'Invite someone into this organisation',
    description:
      'There is no self-serve signup. The response carries the raw invite token once; in production it is emailed and only its hash is stored.',
  })
  invite(@CurrentUser() user: AuthUser, @Body() dto: InviteUserDto) {
    return this.users.invite(user, dto);
  }

  @Post('users/:id/resend-invitation')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'Reissue an invitation, invalidating the previous token' })
  resend(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.users.resendInvitation(user, id);
  }

  @Patch('users/:id/tier')
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  @ApiOperation({ summary: 'Change someone’s tier' })
  changeTier(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ChangeTierDto) {
    return this.users.changeTier(user, id, dto.tier as UserTier);
  }

  @Post('users/:id/suspend')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({
    summary: 'Suspend someone',
    description: 'Preserves their audit history; revokes every session and share link they created.',
  })
  suspend(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.users.suspend(user, id);
  }

  @Post('users/:id/reinstate')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'Reinstate a suspended person' })
  reinstate(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.users.reinstate(user, id);
  }

  @Get('roles')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'Roles available in this organisation' })
  roles(@CurrentUser() user: AuthUser) {
    return this.users.listRoles(user);
  }

  // -- Public: accepting an invitation --------------------------------------

  @Public()
  @Get('invitations/:token')
  @ApiOperation({ summary: 'What this invitation is for, before accepting it' })
  describe(@Param('token') token: string) {
    return this.users.describeInvite(token);
  }

  @Public()
  @Post('invitations/:token/accept')
  @ApiOperation({ summary: 'Set a password and activate the account' })
  accept(@Param('token') token: string, @Body() dto: AcceptInviteDto) {
    return this.users.acceptInvite(token, dto.password);
  }
}
