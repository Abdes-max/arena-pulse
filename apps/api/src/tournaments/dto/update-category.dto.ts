import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';

const SUPPORTED_CURRENCIES = ['eur', 'usd', 'gbp', 'chf', 'cad'];

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  // Null clears the fee (category becomes free again); omit to leave
  // unchanged. Smallest currency unit (cents), matching Stripe's convention.
  @IsOptional()
  @IsInt()
  @Min(0)
  registrationFeeCents?: number | null;

  @IsOptional()
  @IsString()
  @IsIn(SUPPORTED_CURRENCIES)
  registrationFeeCurrency?: string;
}
