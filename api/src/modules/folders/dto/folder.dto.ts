import { Classification } from '../../../common/db';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateFolderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsEnum(Classification)
  classification?: Classification;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  /** Set false to isolate this subtree from grants made above it. */
  @IsOptional()
  @IsBoolean()
  inheritAccess?: boolean;
}

export class RenameFolderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}

export class MoveFolderDto {
  /** Omit or send null to move the folder to the root. */
  @IsOptional()
  @IsString()
  parentId?: string | null;
}
