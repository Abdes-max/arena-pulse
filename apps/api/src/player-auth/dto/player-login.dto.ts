import { IsEmail, IsString, MaxLength } from 'class-validator';

export class PlayerLoginDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MaxLength(128)
  password!: string;
}
