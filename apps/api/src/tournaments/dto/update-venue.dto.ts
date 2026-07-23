import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateVenueDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
