import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { KNOCKOUT_SIZES } from '../knockout-phase.util';

// One-screen "plateau" creation: a single-day event with N teams rotating on
// K fields. Everything the regular flow asks for on separate pages (category,
// venue, fields, teams, structure, calendar) is derived from these fields.
export class CreateQuickPlateauDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsUUID()
  sportId!: string;

  // Calendar day of the plateau, as picked by the organizer (YYYY-MM-DD).
  @IsISO8601({ strict: true })
  date!: string;

  // First kickoff, already converted to an absolute instant by the client
  // (it alone knows the organizer's timezone).
  @IsISO8601()
  startDateTime!: string;

  @IsInt()
  @Min(2)
  @Max(64)
  teamCount!: number;

  @IsInt()
  @Min(1)
  @Max(20)
  fieldCount!: number;

  @IsInt()
  @Min(1)
  @Max(180)
  matchDurationMinutes!: number;

  @IsInt()
  @Min(0)
  @Max(120)
  breakDurationMinutes!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(16)
  poolCount?: number;

  // Older clients: a plain final (same as knockoutSize: 2).
  @IsOptional()
  @IsBoolean()
  withFinal?: boolean;

  // "Phase finale": number of teams in a classic single-elimination bracket
  // after the pools (2 = final, 4 = semi-finals, 8 = quarter-finals...).
  @IsOptional()
  @IsIn(KNOCKOUT_SIZES)
  knockoutSize?: number;

  // Third-place match in the phase finale (4+ teams only).
  @IsOptional()
  @IsBoolean()
  thirdPlaceMatch?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  categoryName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  venueName?: string;

  // Full postal address of the venue picked in the address search.
  @IsOptional()
  @IsString()
  @MaxLength(500)
  venueAddress?: string;
}
