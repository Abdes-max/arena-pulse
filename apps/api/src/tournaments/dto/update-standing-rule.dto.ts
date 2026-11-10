import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';
import { TIE_BREAK_CRITERIA } from '../standing-rule.constants';

export class UpdateStandingRuleDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  winPoints?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  drawPoints?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  lossPoints?: number;

  // Sets sports: points when the match went to the deciding set; null
  // clears it back to the normal win/loss points.
  @IsOptional()
  @IsInt()
  @Min(0)
  decidingSetWinPoints?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  decidingSetLossPoints?: number | null;

  @IsOptional()
  @IsArray()
  @IsIn(TIE_BREAK_CRITERIA, { each: true })
  tieBreakOrder?: string[];

  @IsOptional()
  @IsBoolean()
  supplementaryStandingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  penaltyShootoutEnabled?: boolean;
}
