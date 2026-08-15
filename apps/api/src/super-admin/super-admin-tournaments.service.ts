import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, MatchStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private readonly prisma: PrismaService) {}

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
        teams: true,
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
      teams: tournament.teams.map((team) => ({ id: team.id, name: team.name })),
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
}
