import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RegistrationPlayerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  jerseyNumber?: number;
}

export class CreateRegistrationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  teamName!: string;

  @IsEmail()
  @MaxLength(254)
  managerEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  managerPhone?: string;

  @ValidateNested({ each: true })
  @Type(() => RegistrationPlayerDto)
  @ArrayMinSize(1)
  players!: RegistrationPlayerDto[];
}
