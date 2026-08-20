import {
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateDivisionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsHexColor()
  colorHex?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
