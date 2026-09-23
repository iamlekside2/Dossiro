import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators';
import type { AuthUser } from '../../common/types/auth.types';
import { HrService } from './hr.service';

/**
 * Personnel files (feature 16).
 *
 * Read-only. Filing a document about somebody is done where every other
 * document is filed — this area answers "what do we hold about this person"
 * and "whose file is short of something", which are the two questions a
 * separate screen is for.
 */
@ApiTags('hr')
@Controller('hr')
export class HrController {
  constructor(private readonly hr: HrService) {}

  @Get('people')
  @ApiOperation({
    summary: 'Everybody, with how much of their file is present',
    description:
      'Counts every record naming them through a person-kind field, not only those in one folder '
      + '— a contract naming them as signatory is part of what we hold about them.',
  })
  people(@CurrentUser() user: AuthUser) {
    return this.hr.people(user);
  }

  @Get('people/:id')
  @ApiOperation({
    summary: 'One person’s file, and what is unfilled',
    description:
      'Gaps are computed from the document type’s own required fields rather than a checklist '
      + 'kept beside them, which would drift the first time somebody adds a field.',
  })
  file(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.hr.file(user, id);
  }
}
