import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MaxLength(128)
  password!: string;

  /**
   * "Se souvenir de moi". false: the refresh cookie becomes a browser-session
   * cookie (gone once the browser/app is closed). Omitted = true, the
   * historical behavior (persistent cookie until the token expires).
   */
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
