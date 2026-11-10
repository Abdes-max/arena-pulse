import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SetScoreDto {
  @IsInt()
  @Min(0)
  @Max(99)
  home!: number;

  @IsInt()
  @Min(0)
  @Max(99)
  away!: number;
}

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

  // Sets/games sports only (see ScoreFormat): the detail of each set, in play
  // order. Then homeScore/awayScore are recomputed server-side as the number
  // of sets won, whatever the client sends.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(9)
  @ValidateNested({ each: true })
  @Type(() => SetScoreDto)
  sets?: SetScoreDto[];
}
