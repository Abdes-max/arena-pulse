import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class RegistrationPlayerDto {
  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  jerseyNumber?: number;
}

export class CreateRegistrationDto {
  @IsString()
  @MinLength(1)
  teamName!: string;

  @IsEmail()
  managerEmail!: string;

  @IsOptional()
  @IsString()
  managerPhone?: string;

  @ValidateNested({ each: true })
  @Type(() => RegistrationPlayerDto)
  @ArrayMinSize(1)
  players!: RegistrationPlayerDto[];
}
