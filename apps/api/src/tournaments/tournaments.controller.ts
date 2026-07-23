import {
  Body,
  Controller,
  Get,
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
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { DuplicateTournamentDto } from './dto/duplicate-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { TournamentsService } from './tournaments.service';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard)
@Controller('organizations/:organizationId/tournaments')
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @Post()
  create(
    @Param('organizationId') organizationId: string,
    @Body() dto: CreateTournamentDto,
  ) {
    return this.tournamentsService.create(organizationId, dto);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get()
  list(
    @Param('organizationId') organizationId: string,
    @Query('status') status?: string,
  ) {
    return this.tournamentsService.list(organizationId, status);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get(':tournamentId')
  getOne(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.tournamentsService.getDetail(organizationId, tournamentId);
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @Patch(':tournamentId')
  update(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: UpdateTournamentDto,
  ) {
    return this.tournamentsService.update(organizationId, tournamentId, dto);
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':tournamentId/publish')
  publish(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.tournamentsService.publish(organizationId, tournamentId);
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':tournamentId/unpublish')
  unpublish(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.tournamentsService.unpublish(organizationId, tournamentId);
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':tournamentId/archive')
  archive(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.tournamentsService.archive(organizationId, tournamentId);
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  @Post(':tournamentId/unarchive')
  unarchive(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.tournamentsService.unarchive(organizationId, tournamentId);
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @Post(':tournamentId/duplicate')
  duplicate(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: DuplicateTournamentDto,
  ) {
    return this.tournamentsService.duplicate(organizationId, tournamentId, dto);
  }
}
