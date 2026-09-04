import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class ResolveTenantDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  email!: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  password!: string;

  /**
   * Which tenant to sign into. Required only when the address exists in more
   * than one; POST /auth/resolve says whether it does.
   */
  @IsOptional()
  @IsString()
  organizationId?: string;

  /**
   * Sign in even though this account is already signed in somewhere else,
   * ending that session.
   *
   * Only meaningful for organisations with single-session sign-in switched on.
   * The first attempt returns 409 with the details of the live session so the
   * person can recognise whether it is their own other device or somebody
   * else's; sending it again with this flag is the deliberate second step.
   */
  @IsOptional()
  @IsBoolean()
  takeover?: boolean;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters' })
  newPassword!: string;
}
