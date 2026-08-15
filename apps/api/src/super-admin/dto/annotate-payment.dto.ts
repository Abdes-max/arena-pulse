import { IsString, MinLength } from 'class-validator';

export class AnnotatePaymentDto {
  @IsString()
  @MinLength(1)
  note!: string;
}
