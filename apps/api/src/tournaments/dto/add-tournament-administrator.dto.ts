import { IsArray, IsEmail, IsString } from 'class-validator';

export class AddTournamentAdministratorDto {
  @IsEmail()
  email!: string;

  @IsArray()
  @IsString({ each: true })
  permissionKeys!: string[];
}
