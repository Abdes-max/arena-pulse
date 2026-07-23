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
