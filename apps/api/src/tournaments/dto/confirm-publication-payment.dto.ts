import { IsString, MinLength } from 'class-validator';

export class ConfirmPublicationPaymentDto {
  @IsString()
  @MinLength(1)
  sessionId!: string;
}
