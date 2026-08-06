import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

// Generates every knockout tier of a category's matches together, sharing
// `fieldIds` in one continuous rotation across tiers -- unlike
// GenerateBracketMatchesDto (one bracket, explicit startDateTime), the start
// time here is never entered by hand: it's computed from the pool phase's
// last scheduled match plus `breakAfterPoolsMinutes`.
export class GenerateAllBracketMatchesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  fieldIds!: string[];

  @IsInt()
  @Min(0)
  breakAfterPoolsMinutes!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  matchDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  breakDurationMinutes?: number;
}
