import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreatePlayerDto {
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

  @IsOptional()
  @IsBoolean()
  isCaptain?: boolean;
}
