import { Injectable, NotFoundException } from '@nestjs/common';
import { Player } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';
import { TeamsService } from './teams.service';
import { TournamentsService } from './tournaments.service';

@Injectable()
export class PlayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly teamsService: TeamsService,
  ) {}

  async create(
    organizationId: string,
    tournamentId: string,
    teamId: string,
    dto: CreatePlayerDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.teamsService.assertTeamExists(tournamentId, teamId);

    const player = await this.prisma.player.create({
      data: {
        teamId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        jerseyNumber: dto.jerseyNumber,
        isCaptain: dto.isCaptain ?? false,
      },
    });
    return this.toSummary(player);
  }

  async list(organizationId: string, tournamentId: string, teamId: string) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    await this.teamsService.assertTeamExists(tournamentId, teamId);

    const players = await this.prisma.player.findMany({
      where: { teamId },
      orderBy: [{ isCaptain: 'desc' }, { lastName: 'asc' }],
    });
    return players.map((player) => this.toSummary(player));
  }

  async update(
    organizationId: string,
    tournamentId: string,
    teamId: string,
    playerId: string,
    dto: UpdatePlayerDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.teamsService.assertTeamExists(tournamentId, teamId);
    await this.getOrThrow(teamId, playerId);

    const updated = await this.prisma.player.update({
      where: { id: playerId },
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        jerseyNumber: dto.jerseyNumber,
        isCaptain: dto.isCaptain,
      },
    });
    return this.toSummary(updated);
  }

  async remove(
    organizationId: string,
    tournamentId: string,
    teamId: string,
    playerId: string,
  ): Promise<void> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.teamsService.assertTeamExists(tournamentId, teamId);
    await this.getOrThrow(teamId, playerId);
    await this.prisma.player.delete({ where: { id: playerId } });
  }

  private async getOrThrow(teamId: string, playerId: string): Promise<Player> {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
    });
    if (!player || player.teamId !== teamId) {
      throw new NotFoundException('Joueur introuvable.');
    }
    return player;
  }

  private toSummary(player: Player) {
    return {
      id: player.id,
      firstName: player.firstName,
      lastName: player.lastName,
      jerseyNumber: player.jerseyNumber,
      isCaptain: player.isCaptain,
    };
  }
}
