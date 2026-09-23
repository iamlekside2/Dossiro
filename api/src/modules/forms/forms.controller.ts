import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Allow, IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/rbac/permissions';
import type { AuthUser } from '../../common/types/auth.types';
import { FormsService, type FormField } from './forms.service';

export class FormDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** Shape is validated by the service against the field kinds it knows. */
  @IsOptional()
  @Allow()
  fields?: FormField[];

  /** Where submissions are filed. Required before publishing. */
  @IsOptional()
  @IsString()
  targetFolderId?: string | null;

  @IsOptional()
  @IsString()
  workflowDefinitionId?: string | null;
}

export class PublishDto {
  @IsBoolean()
  published!: boolean;
}

export class SubmitDto {
  /** Keyed by field key. Validated against the form's own schema. */
  @Allow()
  data!: Record<string, unknown>;
}

/**
 * E-forms (SIG-5, SIG-6).
 *
 * Building a form is administration; submitting to one is ordinary work, so
 * only the first sits behind SETTINGS_MANAGE.
 */
@ApiTags('forms')
@Controller('forms')
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  @Get()
  @ApiOperation({ summary: 'Forms defined by this tenant' })
  list(@CurrentUser() user: AuthUser) {
    return this.forms.list(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One form with its fields' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.forms.get(user, id);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Define a form (SIG-5)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: FormDto) {
    return this.forms.create(user, dto);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Change a form' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: Partial<FormDto>) {
    return this.forms.update(user, id, dto);
  }

  @Patch(':id/published')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({
    summary: 'Open or close a form to submissions',
    description:
      'Refused without a field, or without somewhere to file what arrives — a submission nobody '
      + 'can find is the same as one that was lost.',
  })
  publish(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: PublishDto) {
    return this.forms.setPublished(user, id, dto.published);
  }

  @Post(':id/submissions')
  @ApiOperation({
    summary: 'Submit the form (SIG-6)',
    description:
      'The submission becomes a document in the form’s folder, is indexed so it can be searched '
      + 'by its own content, and starts whatever workflow the form nominates.',
  })
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SubmitDto) {
    return this.forms.submit(user, id, dto.data ?? {});
  }

  @Get(':id/submissions')
  // Reading what people submitted is the same right as changing the form that
  // asked for it. Submitting is deliberately open — that is the point of a
  // form — but the answers are not, and this returned every submitted payload
  // to anyone signed in, including an external party.
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'What has come in, newest first' })
  submissions(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.forms.submissions(user, id);
  }
}
