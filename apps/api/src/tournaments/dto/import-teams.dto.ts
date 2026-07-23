import { IsString } from 'class-validator';

export class ImportTeamsDto {
  @IsString()
  csv!: string;
}
