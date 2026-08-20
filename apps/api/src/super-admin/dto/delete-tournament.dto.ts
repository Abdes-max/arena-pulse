import { IsString } from 'class-validator';

export class DeleteTournamentDto {
  // See DeleteOrganizationDto's comment -- same gate.
  @IsString()
  confirmation!: string;
}
