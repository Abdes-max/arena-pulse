import { IsString, MinLength } from 'class-validator';

export class ConfirmRegistrationPaymentDto {
  @IsString()
  @MinLength(1)
  sessionId!: string;
}
