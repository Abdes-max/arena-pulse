import {
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateFieldDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  surface?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;
}
