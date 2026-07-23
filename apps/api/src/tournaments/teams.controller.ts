import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationRole } from '../../generated/prisma/client';
import { RequireOrgRole } from '../organizations/decorators/require-org-role.decorator';
import { OrganizationRoleGuard } from '../organizations/guards/organization-role.guard';
import { RequireTournamentPermission } from './decorators/require-tournament-permission.decorator';
import { BulkDeleteTeamsDto } from './dto/bulk-delete-teams.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { ImportTeamsDto } from './dto/import-teams.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TournamentPermissionGuard } from './guards/tournament-permission.guard';
import { TeamsService } from './teams.service';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard, TournamentPermissionGuard)
@Controller('organizations/:organizationId/tournaments/:tournamentId/teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PARTICIPANTS')
  @Post()
  create(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: CreateTeamDto,
  ) {
    return this.teamsService.create(organizationId, tournamentId, dto);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get()
  list(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Query('categoryId') categoryId?: string,
    @Query('divisionId') divisionId?: string,
  ) {
    return this.teamsService.list(organizationId, tournamentId, {
      categoryId,
      divisionId,
    });
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="equipes.csv"')
  @Get('export')
  exportCsv(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.teamsService.exportToCsv(organizationId, tournamentId);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PARTICIPANTS')
  @Post('import')
  importCsv(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: ImportTeamsDto,
  ) {
    return this.teamsService.importFromCsv(
      organizationId,
      tournamentId,
      dto.csv,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PARTICIPANTS')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('bulk-delete')
  bulkDelete(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: BulkDeleteTeamsDto,
  ) {
    return this.teamsService.bulkRemove(organizationId, tournamentId, dto);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get(':teamId')
  getOne(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('teamId') teamId: string,
  ) {
    return this.teamsService.getOne(organizationId, tournamentId, teamId);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PARTICIPANTS')
  @Patch(':teamId')
  update(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('teamId') teamId: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teamsService.update(organizationId, tournamentId, teamId, dto);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PARTICIPANTS')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':teamId')
  remove(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('teamId') teamId: string,
  ) {
    return this.teamsService.remove(organizationId, tournamentId, teamId);
  }
}
