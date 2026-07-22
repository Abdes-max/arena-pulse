import { IsEnum } from 'class-validator';
import { OrganizationRole } from '../../../generated/prisma/client';

export class ChangeRoleDto {
  @IsEnum(OrganizationRole)
  role!: OrganizationRole;
}
