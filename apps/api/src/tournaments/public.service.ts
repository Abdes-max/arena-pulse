import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BracketsService } from './brackets.service';
import { CategoriesService } from './categories.service';
import { MATCH_INCLUDE, toMatchSummary } from './match-summary.util';
import { PhasesService } from './phases.service';
import { ScheduleGenerationService } from './schedule-generation.service';
import { StandingsService } from './standings.service';
import { StandingRow } from './standings.util';
import { TeamsService } from './teams.service';
import { TournamentsService } from './tournaments.service';
import { VenuesService } from './venues.service';

/** Team fields visible to the public — never a manager's personal contact details. */
function toPublicTeam(team: {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  divisionId: string | null;
  divisionName: string | null;
  groupId: string | null;
  groupName: string | null;
  position: number;
}) {
  return {
    id: team.id,
    name: team.name,
    categoryId: team.categoryId,
    categoryName: team.categoryName,
    divisionId: team.divisionId,
    divisionName: team.divisionName,
    groupId: team.groupId,
    groupName: team.groupName,
    position: team.position,
  };
}

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly venuesService: VenuesService,
    private readonly categoriesService: CategoriesService,
    private readonly phasesService: PhasesService,
    private readonly teamsService: TeamsService,
    private readonly standingsService: StandingsService,
    private readonly scheduleGenerationService: ScheduleGenerationService,
    private readonly bracketsService: BracketsService,
  ) {}

  async getTournament(slug: string) {
    const tournament = await this.resolveTournament(slug);
    const venues = await this.venuesService.list(
      tournament.organizationId,
      tournament.tournamentId,
    );
    return {
      id: tournament.id,
      name: tournament.name,
      slug: tournament.slug,
      status: tournament.status,
      sportName: tournament.sportName,
      startDate: tournament.startDate,
      endDate: tournament.endDate,
      isOnline: tournament.isOnline,
      theme: tournament.theme,
      venues,
    };
  }

  async listCategories(slug: string) {
    const tournament = await this.resolveTournament(slug);
    return this.categoriesService.list(
      tournament.organizationId,
      tournament.tournamentId,
    );
  }

  async listPhases(slug: string, categoryId: string) {
    const tournament = await this.resolveTournament(slug);
    return this.phasesService.list(
      tournament.organizationId,
      tournament.tournamentId,
      categoryId,
    );
  }

  async listTeams(slug: string, categoryId?: string) {
    const tournament = await this.resolveTournament(slug);
    const teams = await this.teamsService.list(
      tournament.organizationId,
      tournament.tournamentId,
      { categoryId },
    );
    return teams.map(toPublicTeam);
  }

  async getTeam(slug: string, teamId: string) {
    const tournament = await this.resolveTournament(slug);
    const team = await this.teamsService.getOne(
      tournament.organizationId,
      tournament.tournamentId,
      teamId,
    );
    const matches = await this.prisma.match.findMany({
      where: { OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] },
      include: MATCH_INCLUDE,
      orderBy: [{ timeSlot: { startTime: 'asc' } }],
    });

    let standing: StandingRow | null = null;
    if (team.groupId) {
      const { rows } = await this.standingsService.getStandings(
        tournament.organizationId,
        tournament.tournamentId,
        team.groupId,
      );
      standing = rows.find((row) => row.teamId === teamId) ?? null;
    }

    return {
      ...toPublicTeam(team),
      matches: matches.map((match) => toMatchSummary(match)),
      standing,
    };
  }

  async getStandings(slug: string, groupId: string) {
    const tournament = await this.resolveTournament(slug);
    return this.standingsService.getStandings(
      tournament.organizationId,
      tournament.tournamentId,
      groupId,
    );
  }

  async getQualifications(slug: string, groupId: string) {
    const tournament = await this.resolveTournament(slug);
    return this.standingsService.getQualifications(
      tournament.organizationId,
      tournament.tournamentId,
      groupId,
    );
  }

  async listPhaseMatches(slug: string, phaseId: string) {
    const tournament = await this.resolveTournament(slug);
    return this.scheduleGenerationService.list(
      tournament.organizationId,
      tournament.tournamentId,
      phaseId,
    );
  }

  async listBracketMatches(slug: string, bracketId: string) {
    const tournament = await this.resolveTournament(slug);
    return this.bracketsService.listMatches(
      tournament.organizationId,
      tournament.tournamentId,
      bracketId,
    );
  }

  async getUpcomingMatches(slug: string, limit = 3) {
    const tournament = await this.resolveTournament(slug);
    const matches = await this.prisma.match.findMany({
      where: {
        status: 'SCHEDULED',
        timeSlot: { startTime: { gte: new Date() } },
        OR: [
          { group: { phase: { category: { tournamentId: tournament.tournamentId } } } },
          {
            knockoutBracket: {
              phase: { category: { tournamentId: tournament.tournamentId } },
            },
          },
        ],
      },
      include: MATCH_INCLUDE,
      orderBy: [{ timeSlot: { startTime: 'asc' } }],
      take: limit,
    });
    return matches.map((match) => toMatchSummary(match));
  }

  private resolveTournament(slug: string) {
    return this.tournamentsService.getPublicBySlug(slug);
  }
}
