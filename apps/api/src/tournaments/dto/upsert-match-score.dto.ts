import { IsInt, IsOptional, Min } from 'class-validator';

export class UpsertMatchScoreDto {
  @IsInt()
  @Min(0)
  homeScore!: number;

  @IsInt()
  @Min(0)
  awayScore!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  homePenaltyScore?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  awayPenaltyScore?: number;
}
