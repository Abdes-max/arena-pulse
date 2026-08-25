import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, from, map, switchMap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { BracketsService } from './brackets.service';
import { CategoriesService } from './categories.service';
import { CrossGroupQualificationRulesService } from './cross-group-qualification-rules.service';
import { MATCH_INCLUDE, toMatchSummary } from './match-summary.util';
import { PhasesService } from './phases.service';
import { RealtimeService } from './realtime.service';
import { ScheduleGenerationService } from './schedule-generation.service';
import { SponsorsService } from './sponsors.service';
import { StandingsService } from './standings.service';
import { StandingRow } from './standings.util';
import { TeamsService } from './teams.service';
import {
  PublicTournamentSearchParams,
  TournamentsService,
} from './tournaments.service';
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
  logoUrl: string | null;
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
    logoUrl: team.logoUrl,
    position: team.position,
  };
}

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly venuesService: VenuesService,
    private readonly sponsorsService: SponsorsService,
    private readonly categoriesService: CategoriesService,
    private readonly phasesService: PhasesService,
    private readonly teamsService: TeamsService,
    private readonly standingsService: StandingsService,
    private readonly scheduleGenerationService: ScheduleGenerationService,
    private readonly bracketsService: BracketsService,
    private readonly realtimeService: RealtimeService,
    private readonly crossGroupQualificationRulesService: CrossGroupQualificationRulesService,
  ) {}

  listTournaments(limit?: number) {
    return this.tournamentsService.listPublished(limit);
  }

  searchTournaments(params: PublicTournamentSearchParams) {
    return this.tournamentsService.searchPublished(params);
  }

  async getTournament(slug: string) {
    const tournament = await this.resolveTournament(slug);
    const [venues, sponsors] = await Promise.all([
      this.venuesService.list(
        tournament.organizationId,
        tournament.tournamentId,
      ),
      this.sponsorsService.list(
        tournament.organizationId,
        tournament.tournamentId,
      ),
    ]);
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
      logoUrl: tournament.logoUrl,
      description: tournament.description,
      rules: tournament.rules,
      practicalInfo: tournament.practicalInfo,
      venues,
      sponsors,
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
      include: {
        ...MATCH_INCLUDE,
        knockoutBracket: { select: { size: true } },
      },
      orderBy: [{ timeSlot: { startTime: 'asc' } }],
    });

    // A KNOCKOUT_ONLY structure preset's group is the fictitious seed group
    // (see StructurePresetsService's KNOCKOUT_ONLY_SEED_NAME) -- teams never
    // actually play a pool phase there, so there's no real "Classement de
    // poule" to show for them.
    let standing: StandingRow | null = null;
    if (team.groupId) {
      const group = await this.prisma.group.findUnique({
        where: { id: team.groupId },
        select: { phase: { select: { isSeedPhase: true } } },
      });
      if (group && !group.phase.isSeedPhase) {
        const { rows } = await this.standingsService.getStandings(
          tournament.organizationId,
          tournament.tournamentId,
          team.groupId,
        );
        standing = rows.find((row) => row.teamId === teamId) ?? null;
      }
    }

    return {
      ...toPublicTeam(team),
      matches: matches.map((match) => ({
        ...toMatchSummary(match),
        // A team's matches can span several different knockout brackets (e.g.
        // Champions/Europa/Conference League, business-rules.md), each with
        // its own size -- so unlike schedule.page.ts (which only ever shows
        // one phase's matches at a time and derives this from `phases`),
        // this endpoint computes it per match instead of requiring the
        // frontend to fetch every phase just to resolve one team's history.
        knockoutTotalRounds: match.knockoutBracket
          ? Math.log2(match.knockoutBracket.size)
          : null,
      })),
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
    // Direct per-pool rules and cross-group rules (N best 3rd place across
    // every pool) merged into one flat list -- see StandingsController's
    // own getQualifications for why.
    const [direct, crossGroup] = await Promise.all([
      this.standingsService.getQualifications(
        tournament.organizationId,
        tournament.tournamentId,
        groupId,
      ),
      this.crossGroupQualificationRulesService.getGroupQualifications(
        tournament.organizationId,
        tournament.tournamentId,
        groupId,
      ),
    ]);
    return [...direct, ...crossGroup];
  }

  async listPhaseMatches(slug: string, phaseId: string) {
    const tournament = await this.resolveTournament(slug);
    // A knockout phase's later rounds exist as soon as the bracket is
    // generated, but with no opponents yet -- shown as-is (homeSourceLabel/
    // awaySourceLabel carry the placeholder, e.g. "Vainqueur Quart de finale
    // 1"), same as the admin Calendrier page.
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
        // Excludes a knockout round's not-yet-determined placeholder
        // matches (see BracketsService.generateMatches) from the public
        // "upcoming matches" list -- "? vs ?" isn't a useful preview.
        homeTeamId: { not: null },
        awayTeamId: { not: null },
        timeSlot: { startTime: { gte: new Date() } },
        OR: [
          {
            group: {
              phase: { category: { tournamentId: tournament.tournamentId } },
            },
          },
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

  /**
   * SSE stream for a tournament's public site (docs/architecture/realtime-strategy.md).
   * Emits a minimal "something changed" signal per match, never the match
   * payload itself — the client already has REST endpoints for that shape.
   */
  streamMatchEvents(slug: string): Observable<MessageEvent> {
    return from(this.resolveTournament(slug)).pipe(
      switchMap((tournament) =>
        this.realtimeService.forTournament(tournament.tournamentId),
      ),
      map((event) => ({ data: { type: event.type, matchId: event.matchId } })),
    );
  }

  private resolveTournament(slug: string) {
    return this.tournamentsService.getPublicBySlug(slug);
  }
}
