import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateKnockoutBracketDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  size?: number;

  @IsOptional()
  @IsBoolean()
  hasRankingMatch?: boolean;
}
