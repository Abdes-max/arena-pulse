import { IsString } from 'class-validator';

export class DeleteUserDto {
  // See DeleteOrganizationDto's comment -- same gate.
  @IsString()
  confirmation!: string;
}
