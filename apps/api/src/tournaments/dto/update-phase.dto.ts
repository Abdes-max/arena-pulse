import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdatePhaseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
