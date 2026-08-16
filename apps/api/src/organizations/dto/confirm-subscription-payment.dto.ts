import { IsString, MinLength } from 'class-validator';

export class ConfirmSubscriptionPaymentDto {
  @IsString()
  @MinLength(1)
  sessionId!: string;
}
