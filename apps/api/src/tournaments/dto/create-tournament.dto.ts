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

  // Whether a published tournament appears in the public directory search
  // -- see the doc comment on Tournament.isListed in schema.prisma.
  @IsOptional()
  @IsBoolean()
  isListed?: boolean;

  @IsOptional()
  @IsEnum(PublicTheme)
  theme?: PublicTheme;
}
