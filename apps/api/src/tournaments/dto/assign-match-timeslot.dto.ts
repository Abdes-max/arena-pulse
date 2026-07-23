import { IsUUID, ValidateIf } from 'class-validator';

export class AssignMatchTimeslotDto {
  @ValidateIf((dto: AssignMatchTimeslotDto) => dto.timeSlotId !== null)
  @IsUUID()
  timeSlotId!: string | null;
}
