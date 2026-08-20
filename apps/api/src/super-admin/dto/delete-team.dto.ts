import { IsString } from 'class-validator';

export class DeleteTeamDto {
  // See DeleteOrganizationDto's comment -- same gate.
  @IsString()
  confirmation!: string;
}
