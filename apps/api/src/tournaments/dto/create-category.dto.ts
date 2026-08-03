import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

const SUPPORTED_CURRENCIES = ['eur', 'usd', 'gbp', 'chf', 'cad'];

export class CreateCategoryDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  // Null/omitted = free to join. Smallest currency unit (cents), matching
  // Stripe's convention.
  @IsOptional()
  @IsInt()
  @Min(0)
  registrationFeeCents?: number;

  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_CURRENCIES)
  registrationFeeCurrency?: string;
}
