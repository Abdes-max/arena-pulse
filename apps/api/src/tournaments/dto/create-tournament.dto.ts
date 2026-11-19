import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  Matches,
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

  /**
   * Organizing club picked from the club directory (ClubDirectoryService),
   * e.g. "fff:553079" or "club:handball:allauch-handball" -- its crest is
   * then imported as the tournament logo (every plan).
   */
  @IsOptional()
  @Matches(/^(fff:\d{1,10}|club:[a-z]+:[a-z0-9-]{1,150}|siren:\d{9})$/)
  organizerClubId?: string;
}
