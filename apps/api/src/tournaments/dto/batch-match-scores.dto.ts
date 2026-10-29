import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { UpsertMatchScoreDto } from './upsert-match-score.dto';

export class BatchMatchScoreEntryDto extends UpsertMatchScoreDto {
  @IsUUID()
  matchId!: string;
}

export class BatchMatchScoresDto {
  // One rotation's worth -- a few fields, never hundreds.
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => BatchMatchScoreEntryDto)
  scores!: BatchMatchScoreEntryDto[];

  // True: final results (match COMPLETED, standings updated). False: just
  // the running score (match LIVE), same as PUT matches/:id/score.
  @IsOptional()
  @IsBoolean()
  validate?: boolean;
}
