import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
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

  // GROUP_STAGE only -- ignored for KNOCKOUT. See CompetitionPhase.doubleRoundRobin.
  @IsOptional()
  @IsBoolean()
  doubleRoundRobin?: boolean;
}
