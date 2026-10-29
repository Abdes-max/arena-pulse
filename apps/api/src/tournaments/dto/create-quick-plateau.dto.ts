import {
  IsBoolean,
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

  // A final between the two best teams (1st vs 2nd of a single pool, or the
  // two pool winners) -- only offered for 1 or 2 pools.
  @IsOptional()
  @IsBoolean()
  withFinal?: boolean;

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
}
