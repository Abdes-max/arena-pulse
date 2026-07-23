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
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { TournamentPermissionGuard } from './guards/tournament-permission.guard';
import { VenuesService } from './venues.service';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard, TournamentPermissionGuard)
@Controller('organizations/:organizationId/tournaments/:tournamentId/venues')
export class VenuesController {
  constructor(private readonly venuesService: VenuesService) {}

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_GENERAL')
  @Post()
  create(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: CreateVenueDto,
  ) {
    return this.venuesService.create(organizationId, tournamentId, dto);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get()
  list(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.venuesService.list(organizationId, tournamentId);
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_GENERAL')
  @Patch(':venueId')
  update(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('venueId') venueId: string,
    @Body() dto: UpdateVenueDto,
  ) {
    return this.venuesService.update(
      organizationId,
      tournamentId,
      venueId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @RequireTournamentPermission('MANAGE_GENERAL')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':venueId')
  remove(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('venueId') venueId: string,
  ) {
    return this.venuesService.remove(organizationId, tournamentId, venueId);
  }
}
