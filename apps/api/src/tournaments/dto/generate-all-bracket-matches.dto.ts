import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

// Generates every knockout tier of a category's matches together, sharing
// `fieldIds` in one continuous rotation across tiers -- unlike
// GenerateBracketMatchesDto (one bracket, explicit startDateTime), the start
// time is usually never entered by hand: it's computed from the pool
// phase's last scheduled match plus `breakAfterPoolsMinutes`. The exception
// is a category whose only "pool" phase is a KNOCKOUT_ONLY structure
// preset's fictitious seed phase (CompetitionPhase.isSeedPhase) -- it never
// has scheduled matches to compute from, so `startDateTime` is required
// instead and `breakAfterPoolsMinutes` is ignored. See
// BracketsService.generateAllMatches.
export class GenerateAllBracketMatchesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  fieldIds!: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  breakAfterPoolsMinutes?: number;

  @IsOptional()
  @IsISO8601()
  startDateTime?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  matchDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  breakDurationMinutes?: number;
}
