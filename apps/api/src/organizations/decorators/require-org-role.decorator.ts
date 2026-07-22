import { SetMetadata } from '@nestjs/common';
import { OrganizationRole } from '../../../generated/prisma/client';

export const REQUIRE_ORG_ROLE_KEY = 'requireOrgRole';
export const RequireOrgRole = (role: OrganizationRole) =>
  SetMetadata(REQUIRE_ORG_ROLE_KEY, role);
