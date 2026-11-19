import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  MinLength,
  Matches,
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

  /** Card details, e.g. "5 contre 5" and "Elite"; null clears them. */
  @IsOptional()
  @ValidateIf((dto: UpdateTournamentDto) => dto.format !== null)
  @IsString()
  @MaxLength(50)
  format?: string | null;

  @IsOptional()
  @ValidateIf((dto: UpdateTournamentDto) => dto.level !== null)
  @IsString()
  @MaxLength(50)
  level?: string | null;

  // Whether a published tournament appears in the public directory search
  // -- see the doc comment on Tournament.isListed in schema.prisma.
  @IsOptional()
  @IsBoolean()
  isListed?: boolean;

  /** Same as CreateTournamentDto.organizerClubId; empty string unlinks the club. */
  @IsOptional()
  @Matches(/^(fff:\d{1,10}|club:[a-z]+:[a-z0-9-]{1,150}|siren:\d{9})?$/)
  organizerClubId?: string;

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
