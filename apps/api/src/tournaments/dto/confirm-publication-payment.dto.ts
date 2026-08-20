import { IsString, MaxLength, MinLength } from 'class-validator';

export class ConfirmPublicationPaymentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  sessionId!: string;
}
