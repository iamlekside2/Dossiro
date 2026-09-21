import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Classification, ContentKind } from '../../common/db';
import { CurrentUser } from '../../common/decorators';
import type { AuthUser } from '../../common/types/auth.types';
import { SearchService, type FieldCriterion } from './search.service';

/**
 * `fieldId:op:value`, repeated, into criteria.
 *
 * A compact encoding because these ride on a GET — a saved search should be a
 * URL somebody can send to a colleague, which rules out a JSON body. Anything
 * malformed is dropped rather than rejected: one bad criterion in a long URL
 * should not lose the whole query, and the service refuses an unknown field id
 * anyway.
 */
function parseFieldCriteria(raw?: string | string[]): FieldCriterion[] | undefined {
  if (!raw) return undefined;
  const list = Array.isArray(raw) ? raw : [raw];

  const parsed = list.flatMap((entry): FieldCriterion[] => {
    // Only the first two colons separate: a value may contain one, as a time
    // of day does.
    const first = entry.indexOf(':');
    const second = entry.indexOf(':', first + 1);
    if (first < 1) return [];

    const fieldId = entry.slice(0, first);
    const op = (second === -1 ? entry.slice(first + 1) : entry.slice(first + 1, second)) as
      FieldCriterion['op'];
    const rest = second === -1 ? '' : entry.slice(second + 1);

    if (op === 'set' || op === 'unset') return [{ fieldId, op }];
    if (!rest) return [];

    if (op === 'between') {
      const [from, to] = rest.split('..');
      if (!from || !to) return [];
      return [{ fieldId, op, value: from, value2: to }];
    }

    return [{ fieldId, op, value: rest }];
  });

  return parsed.length ? parsed : undefined;
}

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
  @ApiQuery({ name: 'documentTypeId', required: false, description: 'Only this document type (SRC-4)' })
  @ApiQuery({
    name: 'field',
    required: false,
    isArray: true,
    description:
      'A condition on an index field, as `fieldId:op:value` — repeat for several, which are '
      + 'combined with AND. Operators: eq, ne, lt, lte, gt, gte, contains, set, unset, and '
      + '`between` as `fieldId:between:from..to`. Example: '
      + '`field=abc:eq:Northwind&field=def:between:2027-01-01..2027-12-31`.',
  })
  run(
    @CurrentUser() user: AuthUser,
    @Query('q') q?: string,
    @Query('inContent') inContent?: string,
    @Query('folderId') folderId?: string,
    @Query('documentTypeId') documentTypeId?: string,
    @Query('field') field?: string | string[],
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
      documentTypeId,
      fields: parseFieldCriteria(field),
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
