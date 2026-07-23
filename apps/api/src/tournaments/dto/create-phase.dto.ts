import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { CompetitionPhaseType } from '../../../generated/prisma/client';

export class CreatePhaseDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(CompetitionPhaseType)
  type!: CompetitionPhaseType;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
