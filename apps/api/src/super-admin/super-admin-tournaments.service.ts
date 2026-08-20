import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Prisma, MatchStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DeletePlayerDto } from './dto/delete-player.dto';
import { DeleteTeamDto } from './dto/delete-team.dto';
import { DeleteTournamentDto } from './dto/delete-tournament.dto';
import { SuperAdminAuditLogService } from './super-admin-audit-log.service';

// A Match has no direct tournamentId -- it hangs off either a Group or a
// KnockoutBracket, each of which reaches the tournament through
// phase.category.tournamentId. Reused by both list() (count) and
// getDetail() (full match rows) below.
function matchesInTournamentWhere(
  tournamentId: string,
): Prisma.MatchWhereInput {
  return {
    OR: [
      { group: { phase: { category: { tournamentId } } } },
      { knockoutBracket: { phase: { category: { tournamentId } } } },
    ],
  };
}

@Injectable()
export class SuperAdminTournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditLog: SuperAdminAuditLogService,
  ) {}

  async list() {
    const tournaments = await this.prisma.tournament.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        organization: true,
        sport: true,
        _count: { select: { teams: true } },
      },
    });
    const matchesPlayedCounts = await Promise.all(
      tournaments.map((tournament) =>
        this.prisma.match.count({
          where: {
            ...matchesInTournamentWhere(tournament.id),
            status: { in: [MatchStatus.COMPLETED, MatchStatus.FORFEITED] },
          },
        }),
      ),
    );
    return tournaments.map((tournament, index) => ({
      id: tournament.id,
      name: tournament.name,
      organizationId: tournament.organizationId,
      organizationName: tournament.organization.name,
      sportName: tournament.sport.name,
      status: tournament.status,
      teamsCount: tournament._count.teams,
      matchesPlayedCount: matchesPlayedCounts[index],
      createdAt: tournament.createdAt,
    }));
  }

  async getDetail(tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: {
        organization: true,
        sport: true,
        teams: { include: { players: true }, orderBy: { name: 'asc' } },
        referees: true,
        categories: true,
      },
    });
    if (!tournament) {
      throw new NotFoundException('Tournoi introuvable.');
    }
    const matches = await this.prisma.match.findMany({
      where: matchesInTournamentWhere(tournamentId),
      include: { homeTeam: true, awayTeam: true, score: true },
      orderBy: { createdAt: 'desc' },
    });
    return {
      id: tournament.id,
      name: tournament.name,
      organizationId: tournament.organizationId,
      organizationName: tournament.organization.name,
      sportName: tournament.sport.name,
      status: tournament.status,
      createdAt: tournament.createdAt,
      teams: tournament.teams.map((team) => ({
        id: team.id,
        name: team.name,
        players: team.players.map((player) => ({
          id: player.id,
          firstName: player.firstName,
          lastName: player.lastName,
        })),
      })),
      referees: tournament.referees.map((referee) => ({
        id: referee.id,
        firstName: referee.firstName,
        lastName: referee.lastName,
        email: referee.email,
      })),
      categories: tournament.categories.map((category) => ({
        id: category.id,
        name: category.name,
      })),
      matches: matches.map((match) => ({
        id: match.id,
        status: match.status,
        homeTeamName: match.homeTeam?.name ?? null,
        awayTeamName: match.awayTeam?.name ?? null,
        homeScore: match.score?.homeScore ?? null,
        awayScore: match.score?.awayScore ?? null,
      })),
    };
  }

  /**
   * Unconditional -- no check on status (published or not) or on whether
   * matches have already been played, unlike the organizer-side editable
   * checks (assertTournamentIsEditable). The super-admin is a trusted role
   * deliberately choosing to delete this exact tournament.
   */
  async deleteTournament(
    tournamentId: string,
    superAdminId: string,
    dto: DeleteTournamentDto,
  ): Promise<void> {
    this.assertConfirmation(dto.confirmation);
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
    });
    if (!tournament) {
      throw new NotFoundException('Tournoi introuvable.');
    }
    const [teams, sponsors] = await Promise.all([
      this.prisma.team.findMany({
        where: { tournamentId },
        select: { logoUrl: true },
      }),
      this.prisma.tournamentSponsor.findMany({
        where: { tournamentId },
        select: { logoUrl: true },
      }),
    ]);
    await this.prisma.tournament.delete({ where: { id: tournamentId } });
    await Promise.all([
      this.deleteLogoFile('tournament-logos', tournament.logoUrl),
      ...teams.map((t) => this.deleteLogoFile('team-logos', t.logoUrl)),
      ...sponsors.map((s) => this.deleteLogoFile('sponsor-logos', s.logoUrl)),
    ]);
    await this.auditLog.record({
      superAdminId,
      action: 'DELETE_TOURNAMENT',
      targetType: 'Tournament',
      targetId: tournamentId,
      note: tournament.name,
    });
  }

  async deleteTeam(
    tournamentId: string,
    teamId: string,
    superAdminId: string,
    dto: DeleteTeamDto,
  ): Promise<void> {
    this.assertConfirmation(dto.confirmation);
    const team = await this.prisma.team.findUnique({ where: { id: teamId } });
    if (!team || team.tournamentId !== tournamentId) {
      throw new NotFoundException('Équipe introuvable.');
    }
    await this.prisma.team.delete({ where: { id: teamId } });
    await this.deleteLogoFile('team-logos', team.logoUrl);
    await this.auditLog.record({
      superAdminId,
      action: 'DELETE_TEAM',
      targetType: 'Team',
      targetId: teamId,
      note: team.name,
    });
  }

  async deletePlayer(
    tournamentId: string,
    teamId: string,
    playerId: string,
    superAdminId: string,
    dto: DeletePlayerDto,
  ): Promise<void> {
    this.assertConfirmation(dto.confirmation);
    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: { team: true },
    });
    if (
      !player ||
      player.teamId !== teamId ||
      player.team.tournamentId !== tournamentId
    ) {
      throw new NotFoundException('Joueur·euse introuvable.');
    }
    await this.prisma.player.delete({ where: { id: playerId } });
    await this.auditLog.record({
      superAdminId,
      action: 'DELETE_PLAYER',
      targetType: 'Player',
      targetId: playerId,
      note: `${player.firstName} ${player.lastName}`,
    });
  }

  /** Same gate as SuperAdminOrganizationsService.assertConfirmation -- see its comment. */
  private assertConfirmation(confirmation: string): void {
    if (confirmation.trim().toUpperCase() !== 'SUPPRIMER') {
      throw new BadRequestException(
        'Confirmation invalide : tapez SUPPRIMER pour confirmer.',
      );
    }
  }

  private uploadsDir(): string {
    return this.configService.get<string>('UPLOADS_DIR', './uploads');
  }

  private async deleteLogoFile(
    subdir: string,
    logoUrl: string | null,
  ): Promise<void> {
    if (!logoUrl) {
      return;
    }
    const filename = logoUrl.split('/').pop();
    if (!filename) {
      return;
    }
    try {
      await fs.unlink(join(this.uploadsDir(), subdir, filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }
}
