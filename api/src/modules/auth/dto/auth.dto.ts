import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

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
