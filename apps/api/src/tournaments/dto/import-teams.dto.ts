import { IsString, MaxLength } from 'class-validator';

export class ImportTeamsDto {
  // Generous cap for a bulk CSV import (well beyond any realistic team
  // count) -- still a defense-in-depth backstop against an unbounded string
  // reaching downstream parsing, independent of the body-parser size limit.
  @IsString()
  @MaxLength(500_000)
  csv!: string;
}
