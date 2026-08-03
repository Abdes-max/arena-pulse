import {
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

// All optional -- omitting fieldIds/startDateTime keeps the previous
// behavior (round 1 seeded with no time slot, placed manually later on the
// Calendrier page's drag-and-drop editor). Providing them schedules round 1
// onto those fields immediately, the same way group-stage generation does.
export class GenerateBracketMatchesDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  fieldIds?: string[];

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
