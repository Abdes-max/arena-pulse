import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class BulkDeleteTeamsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  teamIds!: string[];
}
