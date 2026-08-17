import { Classification } from '../../../common/db';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * Multipart fields arrive as strings, so anything non-string needs an explicit
 * transform before validation.
 */
export class UploadDocumentDto {
  @IsOptional()
  @IsString()
  folderId?: string;

  @IsOptional()
  @IsEnum(Classification)
  classification?: Classification;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class AddVersionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeSummary?: string;
}

export class ListDocumentsDto {
  @IsOptional()
  @IsString()
  folderId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  take?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeDeleted?: boolean;
}
