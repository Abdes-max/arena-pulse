import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateKnockoutBracketDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsInt()
  @Min(2)
  size!: number;

  @IsOptional()
  @IsBoolean()
  hasRankingMatch?: boolean;
}
