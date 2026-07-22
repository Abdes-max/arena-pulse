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
import { AddTournamentAdministratorDto } from './dto/add-tournament-administrator.dto';
import { UpdateTournamentAdministratorPermissionsDto } from './dto/update-tournament-administrator-permissions.dto';
import { TournamentAdministratorsService } from './tournament-administrators.service';

@ApiTags('tournaments')
@UseGuards(OrganizationRoleGuard)
@Controller(
  'organizations/:organizationId/tournaments/:tournamentId/administrators',
)
export class TournamentAdministratorsController {
  constructor(
    private readonly tournamentAdministratorsService: TournamentAdministratorsService,
  ) {}

  @RequireOrgRole(OrganizationRole.ORG_MEMBER)
  @Get()
  list(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
  ) {
    return this.tournamentAdministratorsService.list(
      organizationId,
      tournamentId,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @Post()
  add(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Body() dto: AddTournamentAdministratorDto,
  ) {
    return this.tournamentAdministratorsService.add(
      organizationId,
      tournamentId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @Patch(':administratorId')
  updatePermissions(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('administratorId') administratorId: string,
    @Body() dto: UpdateTournamentAdministratorPermissionsDto,
  ) {
    return this.tournamentAdministratorsService.updatePermissions(
      organizationId,
      tournamentId,
      administratorId,
      dto,
    );
  }

  @RequireOrgRole(OrganizationRole.ORG_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':administratorId')
  remove(
    @Param('organizationId') organizationId: string,
    @Param('tournamentId') tournamentId: string,
    @Param('administratorId') administratorId: string,
  ) {
    return this.tournamentAdministratorsService.remove(
      organizationId,
      tournamentId,
      administratorId,
    );
  }
}
