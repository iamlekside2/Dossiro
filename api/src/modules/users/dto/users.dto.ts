import { UserTier } from '../../../common/db';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class InviteUserDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName!: string;

  @IsOptional()
  @IsEnum(UserTier)
  tier?: UserTier;

  /** Overrides the role implied by the tier. */
  @IsOptional()
  @IsString()
  roleKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;
}

export class AcceptInviteDto {
  @IsString()
  @MinLength(12, { message: 'Choose a password of at least 12 characters' })
  password!: string;
}

export class ChangeTierDto {
  @IsEnum(UserTier)
  tier!: UserTier;
}
