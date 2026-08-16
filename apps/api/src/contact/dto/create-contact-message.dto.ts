import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateContactMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(150)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  message!: string;
}
