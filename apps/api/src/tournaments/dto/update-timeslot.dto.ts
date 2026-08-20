import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTimeSlotDto {
  @IsOptional()
  @IsISO8601()
  startTime?: string;

  @IsOptional()
  @IsISO8601()
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;
}
