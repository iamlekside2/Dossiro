import { AccessLevel, ResourceType, SubjectType } from '../../../common/db';
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';

export class CreateGrantDto {
  @IsEnum(SubjectType)
  subjectType!: SubjectType;

  /** Required when subjectType is USER. */
  @ValidateIf((o: CreateGrantDto) => o.subjectType === SubjectType.USER)
  @IsString()
  userId?: string;

  @ValidateIf((o: CreateGrantDto) => o.subjectType === SubjectType.GROUP)
  @IsString()
  groupId?: string;

  @ValidateIf((o: CreateGrantDto) => o.subjectType === SubjectType.ROLE)
  @IsString()
  roleId?: string;

  /** Required when subjectType is BRANCH. Reaches everyone posted beneath it. */
  @ValidateIf((o: CreateGrantDto) => o.subjectType === SubjectType.BRANCH)
  @IsString()
  branchId?: string;

  @IsEnum(ResourceType)
  resourceType!: ResourceType;

  @ValidateIf((o: CreateGrantDto) => o.resourceType === ResourceType.FOLDER)
  @IsString()
  folderId?: string;

  @ValidateIf((o: CreateGrantDto) => o.resourceType === ResourceType.DOCUMENT)
  @IsString()
  documentId?: string;

  @IsEnum(AccessLevel)
  level!: AccessLevel;

  /** An explicit refusal that beats any allow at the same scope. */
  @IsOptional()
  @IsBoolean()
  isDeny?: boolean;

  /** Time-boxed access, e.g. for a contractor or an auditor. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;
}
