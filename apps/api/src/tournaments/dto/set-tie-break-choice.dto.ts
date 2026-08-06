import { IsUUID } from 'class-validator';

export class SetTieBreakChoiceDto {
  @IsUUID()
  teamId!: string;
}
