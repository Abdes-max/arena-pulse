import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationRole } from '../../generated/prisma/client';
import { RequireOrgRole } from './decorators/require-org-role.decorator';
import { OrganizationRoleGuard } from './guards/organization-role.guard';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@UseGuards(OrganizationRoleGuard)
@Controller('organizations/:organizationId/subscription')
export class OrganizationSubscriptionController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @Get()
  getStatus(@Param('organizationId') organizationId: string) {
    return this.organizationsService.getSubscriptionStatus(organizationId);
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @Get('history')
  getHistory(@Param('organizationId') organizationId: string) {
    return this.organizationsService.listSubscriptionHistory(organizationId);
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @Post()
  subscribe(@Param('organizationId') organizationId: string) {
    return this.organizationsService.subscribe(organizationId);
  }
}
