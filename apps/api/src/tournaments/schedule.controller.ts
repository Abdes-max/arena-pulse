import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrganizationRole } from '../../generated/prisma/client';
import { RequireOrgRole } from '../organizations/decorators/require-org-role.decorator';
import { OrganizationRoleGuard } from '../organizations/guards/organization-role.guard';
import { RequireTournamentPermission } from './decorators/require-tournament-permission.decorator';
import { GenerateScheduleDto } from './dto/generate-schedule.dto';
import { TournamentPermissionGuard } from './guards/tournament-permission.guard';
import { ScheduleGenerationService } from './schedule-generation.service';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard, TournamentPermissionGuard)
@Controller('organizations/:organizationId/tournaments/:tournamentId')
export class ScheduleController {
  constructor(
    private readonly scheduleGenerationService: ScheduleGenerationService,
  ) {}

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_SCHEDULE')
  @Post('phases/:phaseId/generate-schedule')
  generate(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('phaseId') phaseId: string,
    @Body() dto: GenerateScheduleDto,
  ) {
    return this.scheduleGenerationService.generate(
      organizationId,
      tournamentId,
      phaseId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_SCHEDULE')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('phases/:phaseId/schedule')
  reset(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('phaseId') phaseId: string,
  ) {
    return this.scheduleGenerationService.reset(
      organizationId,
      tournamentId,
      phaseId,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get('phases/:phaseId/matches')
  list(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('phaseId') phaseId: string,
  ) {
    return this.scheduleGenerationService.list(
      organizationId,
      tournamentId,
      phaseId,
    );
  }
}
