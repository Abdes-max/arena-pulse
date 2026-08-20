import { IsString, MaxLength } from 'class-validator';

export class DeleteUserDto {
  // See DeleteOrganizationDto's comment -- same gate.
  @IsString()
  @MaxLength(50)
  confirmation!: string;
}
