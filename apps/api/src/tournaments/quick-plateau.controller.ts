import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationRole } from '../../generated/prisma/client';
import { RequireOrgRole } from '../organizations/decorators/require-org-role.decorator';
import { OrganizationRoleGuard } from '../organizations/guards/organization-role.guard';
import { CreateQuickPlateauDto } from './dto/create-quick-plateau.dto';
import { QuickPlateauService } from './quick-plateau.service';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard)
@Controller('organizations/:organizationId/tournaments')
export class QuickPlateauController {
  constructor(private readonly quickPlateauService: QuickPlateauService) {}

  // Same role as the regular POST /tournaments it stands in for.
  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @Post('quick-plateau')
  create(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateQuickPlateauDto,
  ) {
    return this.quickPlateauService.create(organizationId, dto);
  }
}
