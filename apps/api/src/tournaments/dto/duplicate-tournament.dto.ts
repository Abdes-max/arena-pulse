import { IsOptional, IsString, MinLength } from 'class-validator';

export class DuplicateTournamentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;
}
