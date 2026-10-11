import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(1)
  token!: string;

  // Same bounds as RegisterDto.password -- one password strength policy,
  // enforced identically whether the account sets its password at sign-up
  // or here.
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  newPassword!: string;
}
