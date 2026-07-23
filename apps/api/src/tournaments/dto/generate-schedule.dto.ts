import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export class GenerateScheduleDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  fieldIds!: string[];

  @IsISO8601()
  startDateTime!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  matchDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  breakDurationMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  refereesPerMatch?: number;
}
