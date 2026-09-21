import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  Allow,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Classification, DocumentTypeStatus, FieldKind } from '../../common/db';
import { CurrentUser, RequirePermissions } from '../../common/decorators';
import { PERMISSIONS } from '../../common/rbac/permissions';
import type { AuthUser } from '../../common/types/auth.types';
import { DocumentTypesService } from './document-types.service';

export class TypeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  /** TYP-5: off means the type holds one edition only. */
  @IsOptional()
  @IsBoolean()
  keepVersions?: boolean;

  /** TYP-6: watermark every view of a record of this type, not only shares. */
  @IsOptional()
  @IsBoolean()
  watermarkAll?: boolean;

  @IsOptional()
  @IsString()
  retentionPolicyId?: string | null;

  @IsOptional()
  @IsEnum(Classification)
  defaultClassification?: Classification;
}

export class FieldDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(FieldKind)
  kind?: FieldKind;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  /** Selection lists only; the database refuses them on any other kind. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsInt()
  position?: number;

  /** The date this type's retention clock counts from. One per type. */
  @IsOptional()
  @IsBoolean()
  isRetentionAnchor?: boolean;
}

export class StatusDto {
  @IsIn(Object.values(DocumentTypeStatus))
  status!: DocumentTypeStatus;
}

export class ValueDto {
  /**
   * null or an empty string clears the value.
   *
   * `@Allow` rather than a type decorator: the accepted type depends on the
   * field's kind, which is only known once the field is loaded. Without it the
   * whitelisting validator strips the property and every value arrives
   * undefined.
   */
  @Allow()
  value!: string | number | boolean | null;

  /** Set by extraction, absent when a person typed it (CAP-6, CAP-10). */
  @IsOptional()
  @IsNumber()
  confidence?: number;
}

export class AssignTypeDto {
  /** null returns the document to untyped. */
  @IsOptional()
  @IsString()
  documentTypeId?: string | null;
}

/**
 * Document types and their index fields.
 *
 * Defining a type is administration — it changes what every future record of
 * that kind carries — so it sits behind SETTINGS_MANAGE. Reading types and
 * filling in values is ordinary document work and does not.
 */
@ApiTags('document-types')
@Controller()
export class DocumentTypesController {
  constructor(private readonly types: DocumentTypesService) {}

  @Get('document-types')
  @ApiOperation({ summary: 'Document types defined by this tenant (TYP-1)' })
  @ApiQuery({ name: 'status', required: false, enum: DocumentTypeStatus })
  list(@CurrentUser() user: AuthUser, @Query('status') status?: DocumentTypeStatus) {
    return this.types.list(user, status);
  }

  @Get('document-types/:id')
  @ApiOperation({ summary: 'One type with its typed index fields (TYP-2)' })
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.types.get(user, id);
  }

  @Post('document-types')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Define a new document type' })
  create(@CurrentUser() user: AuthUser, @Body() dto: TypeDto) {
    return this.types.create(user, dto);
  }

  @Patch('document-types/:id')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Change a type' })
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: Partial<TypeDto>) {
    return this.types.update(user, id, dto);
  }

  @Patch('document-types/:id/status')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({
    summary: 'Publish, return to draft, or archive',
    description:
      'Publishing needs at least one field: a type with none is one nobody can fill in.',
  })
  setStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: StatusDto) {
    return this.types.setStatus(user, id, dto.status);
  }

  @Delete('document-types/:id')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({
    summary: 'Delete a type',
    description:
      'Refused while documents are filed as this type — that would strip index fields off '
      + 'records that were filed correctly. Archive it instead.',
  })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.types.remove(user, id);
  }

  /* -- Fields -------------------------------------------------------------- */

  @Post('document-types/:id/fields')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Add a typed index field (TYP-2)' })
  addField(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: FieldDto) {
    return this.types.addField(user, id, dto);
  }

  @Patch('document-types/:id/fields/:fieldId')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({
    summary: 'Change a field',
    description:
      'Changing the kind is refused once documents carry values for it, because the value '
      + 'lives in a column chosen by the kind and no conversion is right for every row.',
  })
  updateField(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: Partial<FieldDto>,
  ) {
    return this.types.updateField(user, id, fieldId, dto);
  }

  @Delete('document-types/:id/fields/:fieldId')
  @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  @ApiOperation({ summary: 'Remove a field and every value recorded against it' })
  removeField(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('fieldId') fieldId: string,
  ) {
    return this.types.removeField(user, id, fieldId);
  }

  /* -- Values on a document ------------------------------------------------- */

  @Get('documents/:id/fields')
  @ApiOperation({ summary: 'What this document holds in its type’s fields' })
  values(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.types.valuesFor(user, id);
  }

  @Patch('documents/:id/type')
  @ApiOperation({
    summary: 'File a document as a type, or return it to untyped',
    description:
      'Values belonging to the previous type’s fields are removed: a contract’s expiry date '
      + 'means nothing on a delivery note.',
  })
  setType(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignTypeDto) {
    return this.types.setDocumentType(user, id, dto.documentTypeId ?? null);
  }

  @Patch('documents/:id/fields/:fieldId')
  @ApiOperation({ summary: 'Record a value against one index field (TYP-3)' })
  setValue(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('fieldId') fieldId: string,
    @Body() dto: ValueDto,
  ) {
    return this.types.setValue(user, id, fieldId, dto.value, dto.confidence);
  }
}
