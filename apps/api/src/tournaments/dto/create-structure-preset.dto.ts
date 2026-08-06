import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateStructurePresetDto {
  @IsInt()
  @Min(1)
  teamCount!: number;

  @IsInt()
  @Min(1)
  poolCount!: number;

  @IsInt()
  @Min(1)
  qualifiersPerPool!: number;

  // Pool-stage calendar, generated immediately -- round-robin fixtures only
  // need teams assigned to their pool, not any match result.
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  fieldIds!: string[];

  @IsISO8601()
  startDateTime!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  matchDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  breakDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  refereesPerMatch?: number;

  @IsOptional()
  @IsBoolean()
  doubleRoundRobin?: boolean;

  // Knockout-stage calendar can't be generated yet (its matchups depend on
  // pool standings, which don't exist until pool play concludes) -- these
  // are captured now anyway and stored on the bracket, so "Générer les
  // matchs du tableau" on the Calendrier page can pre-fill from them later
  // instead of asking the organizer to re-enter the same choices.
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  knockoutFieldIds!: string[];

  @IsISO8601()
  knockoutStartDateTime!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  knockoutMatchDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  knockoutBreakDurationMinutes?: number;
}
