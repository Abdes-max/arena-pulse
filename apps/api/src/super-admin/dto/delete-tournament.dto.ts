import { IsString, MaxLength } from 'class-validator';

export class DeleteTournamentDto {
  // See DeleteOrganizationDto's comment -- same gate.
  @IsString()
  @MaxLength(50)
  confirmation!: string;
}
