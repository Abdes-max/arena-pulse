import { IsEmail, IsString } from 'class-validator';

export class PlayerLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}
