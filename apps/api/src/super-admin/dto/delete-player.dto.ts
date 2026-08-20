import { IsString, MaxLength } from 'class-validator';

export class DeletePlayerDto {
  // See DeleteOrganizationDto's comment -- same gate.
  @IsString()
  @MaxLength(50)
  confirmation!: string;
}
