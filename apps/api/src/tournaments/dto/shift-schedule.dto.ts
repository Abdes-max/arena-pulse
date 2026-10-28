import { IsInt, Max, Min, NotEquals } from 'class-validator';

export class ShiftScheduleDto {
  // Signed: negative moves every not-yet-played match earlier. Bounded to a
  // half-day so a typo can't throw the whole programme into the night.
  @IsInt()
  @NotEquals(0)
  @Min(-720)
  @Max(720)
  minutes!: number;
}
