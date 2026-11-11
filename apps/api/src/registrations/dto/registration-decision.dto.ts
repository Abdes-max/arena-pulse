import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectRegistrationDto {
  /** Sent to the registrant in the "refused" email. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RegistrationPaymentDto {
  @IsIn(['UNPAID', 'PAID', 'EXEMPT'])
  paymentStatus!: 'UNPAID' | 'PAID' | 'EXEMPT';
}
