import { IsArray, IsString } from 'class-validator';

export class UpdateTournamentAdministratorPermissionsDto {
  @IsArray()
  @IsString({ each: true })
  permissionKeys!: string[];
}
