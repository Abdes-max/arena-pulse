import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationRole } from '../../generated/prisma/client';
import { RequireOrgRole } from '../organizations/decorators/require-org-role.decorator';
import { OrganizationRoleGuard } from '../organizations/guards/organization-role.guard';
import { RequireTournamentPermission } from './decorators/require-tournament-permission.decorator';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupsService } from './groups.service';
import { TournamentPermissionGuard } from './guards/tournament-permission.guard';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard, TournamentPermissionGuard)
@Controller('organizations/:organizationId/tournaments/:tournamentId')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PHASES')
  @Post('phases/:phaseId/groups')
  create(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('phaseId') phaseId: string,
    @Body() dto: CreateGroupDto,
  ) {
    return this.groupsService.create(
      organizationId,
      tournamentId,
      phaseId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get('phases/:phaseId/groups')
  list(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('phaseId') phaseId: string,
  ) {
    return this.groupsService.list(organizationId, tournamentId, phaseId);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PHASES')
  @Patch('groups/:groupId')
  update(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groupsService.update(
      organizationId,
      tournamentId,
      groupId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PHASES')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('groups/:groupId')
  remove(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('groupId') groupId: string,
  ) {
    return this.groupsService.remove(organizationId, tournamentId, groupId);
  }
}
