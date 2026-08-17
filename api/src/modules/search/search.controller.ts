import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Classification, ContentKind } from '../../common/db';
import { CurrentUser } from '../../common/decorators';
import type { AuthUser } from '../../common/types/auth.types';
import { SearchService } from './search.service';

@ApiTags('search')
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get()
  @ApiOperation({
    summary: 'Search documents (features 6, 7)',
    description:
      'Metadata search by default. Pass inContent=true to full-text search inside document bodies, which returns a relevance rank and a highlighted snippet.',
  })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'inContent', required: false, type: Boolean })
  @ApiQuery({ name: 'modifiedFrom', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'modifiedTo', required: false, description: 'ISO date' })
  run(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('inContent') inContent?: string,
    @Query('folderId') folderId?: string,
    @Query('kind') kind?: ContentKind,
    @Query('classification') classification?: Classification,
    @Query('mimeType') mimeType?: string,
    @Query('ownerId') ownerId?: string,
    @Query('tag') tag?: string,
    @Query('modifiedFrom') modifiedFrom?: string,
    @Query('modifiedTo') modifiedTo?: string,
    @Query('createdFrom') createdFrom?: string,
    @Query('createdTo') createdTo?: string,
    @Query('sort') sort?: 'relevance' | 'modified' | 'created' | 'name' | 'size',
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.search.search(user, {
      q,
      inContent: inContent === 'true',
      folderId,
      kind,
      classification,
      mimeType,
      ownerId,
      tag,
      modifiedFrom: modifiedFrom ? new Date(modifiedFrom) : undefined,
      modifiedTo: modifiedTo ? new Date(modifiedTo) : undefined,
      createdFrom: createdFrom ? new Date(createdFrom) : undefined,
      createdTo: createdTo ? new Date(createdTo) : undefined,
      sort,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }
}
