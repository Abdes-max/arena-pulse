import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentSuperAdmin } from '../super-admin-auth/decorators/current-super-admin.decorator';
import { SuperAdminJwtAuthGuard } from '../super-admin-auth/guards/super-admin-jwt-auth.guard';
import type { AuthenticatedSuperAdmin } from '../super-admin-auth/strategies/super-admin-jwt.strategy';
import { DeletePlayerDto } from './dto/delete-player.dto';
import { DeleteTeamDto } from './dto/delete-team.dto';
import { DeleteTournamentDto } from './dto/delete-tournament.dto';
import { SuperAdminTournamentsService } from './super-admin-tournaments.service';

@ApiTags('super-admin')
@Public()
@UseGuards(SuperAdminJwtAuthGuard)
@Controller('super-admin/tournaments')
export class SuperAdminTournamentsController {
  constructor(
    private readonly tournamentsService: SuperAdminTournamentsService,
  ) {}

  @Get()
  list() {
    return this.tournamentsService.list();
  }

  @Get(':tournamentId')
  getDetail(@Param('tournamentId') tournamentId: string) {
    return this.tournamentsService.getDetail(tournamentId);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':tournamentId')
  deleteTournament(
    @Param('tournamentId') tournamentId: string,
    @Body() dto: DeleteTournamentDto,
    @CurrentSuperAdmin() superAdmin: AuthenticatedSuperAdmin,
  ) {
    return this.tournamentsService.deleteTournament(
      tournamentId,
      superAdmin.id,
      dto,
    );
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':tournamentId/teams/:teamId')
  deleteTeam(
    @Param('tournamentId') tournamentId: string,
    @Param('teamId') teamId: string,
    @Body() dto: DeleteTeamDto,
    @CurrentSuperAdmin() superAdmin: AuthenticatedSuperAdmin,
  ) {
    return this.tournamentsService.deleteTeam(
      tournamentId,
      teamId,
      superAdmin.id,
      dto,
    );
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':tournamentId/teams/:teamId/players/:playerId')
  deletePlayer(
    @Param('tournamentId') tournamentId: string,
    @Param('teamId') teamId: string,
    @Param('playerId') playerId: string,
    @Body() dto: DeletePlayerDto,
    @CurrentSuperAdmin() superAdmin: AuthenticatedSuperAdmin,
  ) {
    return this.tournamentsService.deletePlayer(
      tournamentId,
      teamId,
      playerId,
      superAdmin.id,
      dto,
    );
  }
}
