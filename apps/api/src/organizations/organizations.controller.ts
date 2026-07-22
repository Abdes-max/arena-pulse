import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationRole } from '../../generated/prisma/client';
import { RequireOrgRole } from './decorators/require-org-role.decorator';
import { ChangeRoleDto } from './dto/change-role.dto';
import { OrganizationRoleGuard } from './guards/organization-role.guard';
import { OrganizationsService } from './organizations.service';

@ApiTags('organizations')
@UseGuards(OrganizationRoleGuard)
@Controller('organizations/:organizationId/members')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get()
  listMembers(@Param('organizationId') organizationId: string) {
    return this.organizationsService.listMembers(organizationId);
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @Patch(':memberId')
  changeRole(
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
    @Body() dto: ChangeRoleDto,
  ) {
    return this.organizationsService.changeRole(
      organizationId,
      memberId,
      dto.role,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':memberId')
  removeMember(
    @Param('organizationId') organizationId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.organizationsService.removeMember(organizationId, memberId);
  }
}
