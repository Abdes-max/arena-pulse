import { IsEmail, IsEnum } from 'class-validator';
import { OrganizationRole } from '../../../generated/prisma/client';

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsEnum(OrganizationRole)
  role!: OrganizationRole;
}
