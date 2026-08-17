import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/rbac/permissions';
import type { AuthUser } from '../../common/types/auth.types';
import { BranchesService } from './branches.service';

export class BranchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  code?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  isHeadOffice?: boolean;
}

export class AssignBranchDto {
  /** null unposts the person. */
  @IsOptional()
  @IsString()
  branchId?: string | null;
}

@ApiTags('branches')
@Controller('branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @ApiOperation({ summary: 'Offices of this organisation' })
  list(@CurrentUser() user: AuthUser) {
    return this.branches.list(user);
  }

  @Get('tree')
  @ApiOperation({ summary: 'The same, nested, for a picker' })
  tree(@CurrentUser() user: AuthUser) {
    return this.branches.tree(user);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Open a branch' })
  create(@CurrentUser() user: AuthUser, @Body() dto: BranchDto) {
    return this.branches.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Rename, move or re-detail a branch' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: Partial<BranchDto>) {
    return this.branches.update(user, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({
    summary: 'Close a branch',
    description:
      'Never deletes people or records. Staff and cabinets posted there are unposted and can be reassigned.',
  })
  close(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.branches.close(user, id);
  }

  @Patch('/assign/:userId')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  @ApiOperation({ summary: 'Post someone to a branch' })
  assign(@CurrentUser() user: AuthUser, @Param('userId') userId: string, @Body() dto: AssignBranchDto) {
    return this.branches.assignUser(user, userId, dto.branchId ?? null);
  }
}
