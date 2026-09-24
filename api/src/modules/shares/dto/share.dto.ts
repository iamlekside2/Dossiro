import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateShareDto {
  @IsString()
  documentId!: string;

  /** Exact expiry timestamp. Takes precedence over expiresInHours. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date;

  /** Convenience: 1, 24, 168... Ignored when expiresAt is supplied. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expiresInHours?: number;

  /**
   * Opt out of expiry entirely. Explicit rather than implicit, so a permanent
   * link is always a deliberate decision.
   */
  @IsOptional()
  @IsBoolean()
  neverExpires?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxDownloads?: number;

  /**
   * Exactly six digits, because the recipient's screen is six digit boxes.
   * The API used to accept any string up to 128 characters, which let a sender
   * set a passcode their recipient could not physically type.
   */
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'A share passcode is exactly six digits.' })
  password?: string;

  /** false = view in the browser only, no bytes (feature 18). */
  @IsOptional()
  @IsBoolean()
  allowDownload?: boolean;

  @IsOptional()
  @IsBoolean()
  allowPrint?: boolean;

  @IsOptional()
  @IsBoolean()
  watermark?: boolean;

  /** Restrict to named recipients. Empty means anyone holding the link. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsEmail({}, { each: true })
  allowedEmails?: string[];

  @IsOptional()
  @IsBoolean()
  requireEmailVerification?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class AuthorizeShareDto {
  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
