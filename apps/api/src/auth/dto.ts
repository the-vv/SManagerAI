import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail() @MaxLength(254) email: string;
  @IsString() @MinLength(10, { message: 'Password must be at least 10 characters' }) @MaxLength(200) password: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  /** Required when registration is closed (ALLOW_REGISTRATION=false). */
  @IsOptional() @IsString() @MaxLength(64) inviteCode?: string;
}

export class LoginDto {
  @IsEmail() email: string;
  @IsString() @IsNotEmpty() @MaxLength(200) password: string;
}

export class GoogleLoginDto {
  @IsString() @IsNotEmpty() idToken: string;
  @IsOptional() @IsString() @MaxLength(64) inviteCode?: string;
}

export class ChangePasswordDto {
  @IsString() @IsNotEmpty() currentPassword: string;
  @IsString() @MinLength(10) @MaxLength(200) newPassword: string;
}
