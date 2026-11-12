import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Drag & drop in the calendar: a slot (or a match) goes to a field, at a position. */
export class MoveScheduleItemDto {
  @IsOptional()
  @IsString()
  timeSlotId?: string;

  @IsOptional()
  @IsString()
  matchId?: string;

  @IsString()
  fieldId!: string;

  @IsInt()
  @Min(0)
  index!: number;

  /** Length of the slot created for a match that had none. */
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(600)
  minutes?: number;
}
