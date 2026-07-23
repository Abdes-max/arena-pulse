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
import { CreateRefereeDto } from './dto/create-referee.dto';
import { UpdateRefereeDto } from './dto/update-referee.dto';
import { TournamentPermissionGuard } from './guards/tournament-permission.guard';
import { RefereesService } from './referees.service';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard, TournamentPermissionGuard)
@Controller('organizations/:organizationId/tournaments/:tournamentId/referees')
export class RefereesController {
  constructor(private readonly refereesService: RefereesService) {}

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PARTICIPANTS')
  @Post()
  create(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: CreateRefereeDto,
  ) {
    return this.refereesService.create(organizationId, tournamentId, dto);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get()
  list(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.refereesService.list(organizationId, tournamentId);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PARTICIPANTS')
  @Patch(':refereeId')
  update(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('refereeId') refereeId: string,
    @Body() dto: UpdateRefereeDto,
  ) {
    return this.refereesService.update(
      organizationId,
      tournamentId,
      refereeId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_PARTICIPANTS')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':refereeId')
  remove(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('refereeId') refereeId: string,
  ) {
    return this.refereesService.remove(organizationId, tournamentId, refereeId);
  }
}
