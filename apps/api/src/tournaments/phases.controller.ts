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
import { CreatePhaseDto } from './dto/create-phase.dto';
import { UpdatePhaseDto } from './dto/update-phase.dto';
import { TournamentPermissionGuard } from './guards/tournament-permission.guard';
import { PhasesService } from './phases.service';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard, TournamentPermissionGuard)
@Controller('organizations/:organizationId/tournaments/:tournamentId')
export class PhasesController {
  constructor(private readonly phasesService: PhasesService) {}

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PHASES')
  @Post('categories/:categoryId/phases')
  create(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('categoryId') categoryId: string,
    @Body() dto: CreatePhaseDto,
  ) {
    return this.phasesService.create(
      organizationId,
      tournamentId,
      categoryId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get('categories/:categoryId/phases')
  list(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('categoryId') categoryId: string,
  ) {
    return this.phasesService.list(organizationId, tournamentId, categoryId);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PHASES')
  @Patch('phases/:phaseId')
  update(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('phaseId') phaseId: string,
    @Body() dto: UpdatePhaseDto,
  ) {
    return this.phasesService.update(
      organizationId,
      tournamentId,
      phaseId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PHASES')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('phases/:phaseId')
  remove(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('phaseId') phaseId: string,
  ) {
    return this.phasesService.remove(organizationId, tournamentId, phaseId);
  }
}
