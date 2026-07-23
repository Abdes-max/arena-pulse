import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateFieldDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  surface?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
