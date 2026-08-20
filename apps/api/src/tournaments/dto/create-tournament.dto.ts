import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PublicTheme } from '../../../generated/prisma/client';

export class CreateTournamentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsUUID()
  sportId!: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isOnline?: boolean;

  @IsOptional()
  @IsEnum(PublicTheme)
  theme?: PublicTheme;
}
