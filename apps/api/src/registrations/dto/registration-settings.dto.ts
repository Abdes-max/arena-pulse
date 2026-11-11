import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class RegistrationSettingsDto {
  @IsOptional()
  @IsBoolean()
  open?: boolean;

  @IsOptional()
  @ValidateIf((dto: RegistrationSettingsDto) => dto.opensAt !== null)
  @IsDateString()
  opensAt?: string | null;

  @IsOptional()
  @ValidateIf((dto: RegistrationSettingsDto) => dto.closesAt !== null)
  @IsDateString()
  closesAt?: string | null;

  @IsOptional()
  @ValidateIf((dto: RegistrationSettingsDto) => dto.paymentInfo !== null)
  @IsString()
  @MaxLength(2000)
  paymentInfo?: string | null;
}
