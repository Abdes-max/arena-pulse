import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateKnockoutBracketDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsInt()
  @Min(2)
  size!: number;

  @IsOptional()
  @IsBoolean()
  hasRankingMatch?: boolean;
}
