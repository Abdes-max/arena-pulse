import { IsString } from 'class-validator';

export class DeletePlayerDto {
  // See DeleteOrganizationDto's comment -- same gate.
  @IsString()
  confirmation!: string;
}
