import { OrgStatus } from '../../../common/db';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ProvisionOrgDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  slug?: string;

  @IsEmail({}, { message: 'A valid owner email is required' })
  ownerEmail!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  ownerName!: string;

  /** Email domains that resolve to this tenant. Public providers are refused. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  domains?: string[];

  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  seatLimit?: number;

  @IsOptional()
  @IsString()
  region?: string;
}

export class SetStatusDto {
  @IsEnum(OrgStatus)
  status!: OrgStatus;

  /**
   * Why the status is changing.
   *
   * Mandatory for SUSPENDED and CLOSED — enforced in the service, not here, so
   * that every caller is held to it and not only this route. The shape is all
   * this DTO settles.
   */
  @IsOptional()
  @IsString()
  @MinLength(4, { message: 'A reason needs to say something' })
  @MaxLength(500)
  reason?: string;
}

export class UpdateSettingsDto {
  @IsObject()
  settings!: Record<string, unknown>;
}

export class AddDomainDto {
  @IsString()
  @MinLength(3)
  domain!: string;
}

export class AddHostnameDto {
  @IsString()
  @MinLength(4)
  hostname!: string;
}