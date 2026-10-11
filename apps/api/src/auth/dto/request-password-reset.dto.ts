import { IsEmail, MaxLength } from 'class-validator';

export class RequestPasswordResetDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
