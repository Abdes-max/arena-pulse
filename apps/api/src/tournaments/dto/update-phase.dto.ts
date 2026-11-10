import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  Max,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdatePhaseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

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

  // Sets sports: sets a side must win in this phase (1-3); null = the sport's default.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  setsToWin?: number | null;

  // GROUP_STAGE only -- ignored for KNOCKOUT. See CompetitionPhase.doubleRoundRobin.
  @IsOptional()
  @IsBoolean()
  doubleRoundRobin?: boolean;
}
