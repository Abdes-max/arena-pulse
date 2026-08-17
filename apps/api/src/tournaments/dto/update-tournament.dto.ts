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

export class UpdateTournamentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsUUID()
  sportId?: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string | null;

  @IsOptional()
  @IsISO8601()
  endDate?: string | null;

  @IsOptional()
  @IsBoolean()
  isOnline?: boolean;

  @IsOptional()
  @IsBoolean()
  teamsCanReferee?: boolean;

  @IsOptional()
  @IsEnum(PublicTheme)
  theme?: PublicTheme;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  rules?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  practicalInfo?: string;
}
