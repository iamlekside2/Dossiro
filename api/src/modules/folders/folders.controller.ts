import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AppConfig } from '../../common/config/configuration';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/rbac/permissions';
import type { AuthUser } from '../../common/types/auth.types';
import { CreateFolderDto, MoveFolderDto, RenameFolderDto } from './dto/folder.dto';
import { FoldersService } from './folders.service';

@ApiTags('folders')
@Controller('folders')
export class FoldersController {
  constructor(
    private readonly folders: FoldersService,
    private readonly config: ConfigService<{ app: AppConfig }, true>,
  ) {}

  @Get('tree')
  @ApiOperation({ summary: 'Folder tree, pruned to what the caller may read (feature 4)' })
  tree(@CurrentUser() user: AuthUser, @Query('rootId') rootId?: string) {
    return this.folders.tree(user, rootId);
  }

  @Get(':id/children')
  @ApiOperation({ summary: 'Immediate subfolders and documents' })
  children(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    // "root" is the sentinel for the top level, since there is no id for it.
    return this.folders.children(user, id === 'root' ? null : id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.FOLDER_CREATE)
  @ApiOperation({ summary: 'Create a folder' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFolderDto) {
    return this.folders.create(user, dto);
  }

  @Patch(':id/name')
  @ApiOperation({ summary: 'Rename a folder' })
  rename(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RenameFolderDto) {
    return this.folders.rename(user, id, dto.name);
  }

  @Patch(':id/parent')
  @ApiOperation({ summary: 'Move a folder and its whole subtree' })
  move(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: MoveFolderDto) {
    return this.folders.move(user, id, dto.parentId ?? null);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Soft-delete a folder and its contents',
    description: 'Recoverable from the recycle bin until the retention window elapses (feature 24).',
  })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const days = this.config.get('app', { infer: true }).recycleBinDays;
    return this.folders.softDelete(user, id, days);
  }
}
