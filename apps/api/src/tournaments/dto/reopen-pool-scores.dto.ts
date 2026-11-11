import { IsBoolean, IsOptional } from 'class-validator';

export class ReopenPoolScoresDto {
  /** Acknowledges that scores already entered in the phases fed by these pools will be wiped. */
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
