import { IsUUID } from 'class-validator';

export class ForfeitMatchDto {
  @IsUUID()
  teamId!: string;
}
