import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { CompetitionPhaseType, Match } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateScheduleDto } from './dto/generate-schedule.dto';
import { MATCH_INCLUDE, toMatchSummary } from './match-summary.util';
import { PhasesService } from './phases.service';
import { generateRoundRobinFixtures } from './round-robin.util';
import { TournamentsService } from './tournaments.service';

interface FlatFixture {
  groupId: string;
  round: number;
  homeTeamId: string;
  awayTeamId: string;
}

type RefereePoolEntry =
  | { refereeId: string; refereeingTeamId?: never }
  | { refereeId?: never; refereeingTeamId: string };

@Injectable()
export class ScheduleGenerationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly phasesService: PhasesService,
  ) {}

  async generate(
    organizationId: string,
    tournamentId: string,
    phaseId: string,
    dto: GenerateScheduleDto,
  ) {
    const tournament = await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const phase = await this.phasesService.assertPhaseExists(
      tournamentId,
      phaseId,
    );
    if (phase.type !== CompetitionPhaseType.GROUP_STAGE) {
      throw new BadRequestException(
        'Le calendrier ne peut être généré que pour une phase de poules.',
      );
    }
    // Generating again without resetting first used to silently create a
    // second, fully duplicate set of matches on top of the existing ones --
    // reject outright instead, and point at the explicit reset endpoint.
    const existingMatchCount = await this.prisma.match.count({
      where: { group: { phaseId } },
    });
    if (existingMatchCount > 0) {
      throw new ConflictException(
        'Des matchs existent déjà pour cette phase. Videz le calendrier avant d’en générer un nouveau.',
      );
    }
    await this.assertFieldsBelongToTournament(tournamentId, dto.fieldIds);

    const matchDurationMinutes =
      dto.matchDurationMinutes ?? phase.matchDurationMinutes;
    const breakDurationMinutes =
      dto.breakDurationMinutes ?? phase.breakDurationMinutes;
    const refereesPerMatch = dto.refereesPerMatch ?? phase.refereesPerMatch;
    if (
      dto.matchDurationMinutes !== undefined ||
      dto.breakDurationMinutes !== undefined ||
      dto.refereesPerMatch !== undefined
    ) {
      await this.prisma.competitionPhase.update({
        where: { id: phaseId },
        data: { matchDurationMinutes, breakDurationMinutes, refereesPerMatch },
      });
    }

    const groups = await this.prisma.group.findMany({
      where: { phaseId },
      orderBy: { position: 'asc' },
      include: { teams: { orderBy: { position: 'asc' } } },
    });

    const fixtures: FlatFixture[] = groups.flatMap((group) => {
      const singleLeg = generateRoundRobinFixtures(
        group.teams.map((team) => team.id),
      );
      const legs = phase.doubleRoundRobin
        ? [...singleLeg, ...this.returnLeg(singleLeg)]
        : singleLeg;
      return legs.map((fixture) => ({ ...fixture, groupId: group.id }));
    });
    fixtures.sort((a, b) => a.round - b.round);

    if (fixtures.length === 0) {
      return [];
    }

    const refereePool = await this.buildRefereePool(
      tournamentId,
      phase.categoryId,
      tournament.teamsCanReferee,
    );

    const fieldCursors = new Map<string, Date>(
      dto.fieldIds.map((fieldId) => [fieldId, new Date(dto.startDateTime)]),
    );
    const slotDurationMs =
      (matchDurationMinutes + breakDurationMinutes) * 60_000;

    const createdMatches = await this.prisma.$transaction(async (tx) => {
      const created: Match[] = [];
      for (const [index, fixture] of fixtures.entries()) {
        const fieldId = dto.fieldIds[index % dto.fieldIds.length];
        const startTime = fieldCursors.get(fieldId)!;
        const endTime = new Date(
          startTime.getTime() + matchDurationMinutes * 60_000,
        );
        fieldCursors.set(
          fieldId,
          new Date(startTime.getTime() + slotDurationMs),
        );

        const timeSlot = await tx.timeSlot.create({
          data: { fieldId, startTime, endTime },
        });
        const match = await tx.match.create({
          data: {
            groupId: fixture.groupId,
            homeTeamId: fixture.homeTeamId,
            awayTeamId: fixture.awayTeamId,
            timeSlotId: timeSlot.id,
            round: fixture.round,
          },
        });

        const officials = this.pickOfficials(
          refereePool,
          fixture,
          refereesPerMatch,
          index,
        );
        for (const official of officials) {
          await tx.matchOfficial.create({
            data: { matchId: match.id, ...official },
          });
        }

        created.push(match);
      }
      return created;
    });

    const matches = await this.prisma.match.findMany({
      where: { id: { in: createdMatches.map((match) => match.id) } },
      include: MATCH_INCLUDE,
      orderBy: [{ round: 'asc' }],
    });
    return matches.map((match) => toMatchSummary(match));
  }

  async reset(
    organizationId: string,
    tournamentId: string,
    phaseId: string,
  ): Promise<void> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.phasesService.assertPhaseExists(tournamentId, phaseId);

    // Same reasoning as list() below -- a phase's matches live on its
    // groups (GROUP_STAGE) or directly on its knockout bracket (KNOCKOUT),
    // never both, so clearing only by `group` silently left a knockout
    // bracket's matches in place.
    const phaseMatchFilter = {
      OR: [{ group: { phaseId } }, { knockoutBracket: { phaseId } }],
    };
    const matches = await this.prisma.match.findMany({
      where: phaseMatchFilter,
      select: { id: true, timeSlotId: true },
    });
    const timeSlotIds = matches
      .map((match) => match.timeSlotId)
      .filter((id): id is string => id !== null);

    await this.prisma.$transaction([
      this.prisma.matchOfficial.deleteMany({
        where: { matchId: { in: matches.map((match) => match.id) } },
      }),
      this.prisma.match.deleteMany({ where: phaseMatchFilter }),
      this.prisma.timeSlot.deleteMany({ where: { id: { in: timeSlotIds } } }),
    ]);
  }

  async list(organizationId: string, tournamentId: string, phaseId: string) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    await this.phasesService.assertPhaseExists(tournamentId, phaseId);

    // A match belongs to this phase either via its group (GROUP_STAGE) or
    // directly via a knockout bracket (KNOCKOUT) -- a phase's matches are
    // never split across both, but querying only `group` silently returned
    // nothing at all for a KNOCKOUT phase, hiding real, already-generated
    // bracket matches from the Scores page.
    const matches = await this.prisma.match.findMany({
      where: { OR: [{ group: { phaseId } }, { knockoutBracket: { phaseId } }] },
      include: MATCH_INCLUDE,
      // `round` orders a bracket's rounds sensibly (semis before the final);
      // `timeSlot` is the tiebreaker within a round-robin round.
      orderBy: [{ round: 'asc' }, { timeSlot: { startTime: 'asc' } }],
    });
    return matches.map((match) => toMatchSummary(match));
  }

  /** The reverse half of a double round-robin: same pairings, home/away swapped, rounds continuing after the first leg's. */
  private returnLeg(
    singleLeg: ReturnType<typeof generateRoundRobinFixtures>,
  ): ReturnType<typeof generateRoundRobinFixtures> {
    if (singleLeg.length === 0) {
      return [];
    }
    const maxRound = Math.max(...singleLeg.map((fixture) => fixture.round));
    return singleLeg.map((fixture) => ({
      round: fixture.round + maxRound,
      homeTeamId: fixture.awayTeamId,
      awayTeamId: fixture.homeTeamId,
    }));
  }

  private async assertFieldsBelongToTournament(
    tournamentId: string,
    fieldIds: string[],
  ) {
    const fields = await this.prisma.field.findMany({
      where: { id: { in: fieldIds }, venue: { tournamentId } },
    });
    if (fields.length !== new Set(fieldIds).size) {
      throw new BadRequestException(
        "Un ou plusieurs terrains n'appartiennent pas à ce tournoi.",
      );
    }
    return fields;
  }

  /** Referees are tournament-wide; team-officials (when enabled) are restricted to the phase's own category. */
  private async buildRefereePool(
    tournamentId: string,
    categoryId: string,
    teamsCanReferee: boolean,
  ): Promise<RefereePoolEntry[]> {
    const referees = await this.prisma.referee.findMany({
      where: { tournamentId },
      orderBy: { lastName: 'asc' },
    });
    const pool: RefereePoolEntry[] = referees.map((referee) => ({
      refereeId: referee.id,
    }));

    if (teamsCanReferee) {
      const teams = await this.prisma.team.findMany({
        where: { tournamentId, categoryId },
        select: { id: true },
        orderBy: { position: 'asc' },
      });
      pool.push(...teams.map((team) => ({ refereeingTeamId: team.id })));
    }
    return pool;
  }

  private pickOfficials(
    pool: RefereePoolEntry[],
    fixture: FlatFixture,
    refereesPerMatch: number,
    matchIndex: number,
  ): RefereePoolEntry[] {
    const eligible = pool.filter(
      (entry) =>
        entry.refereeingTeamId === undefined ||
        (entry.refereeingTeamId !== fixture.homeTeamId &&
          entry.refereeingTeamId !== fixture.awayTeamId),
    );
    if (eligible.length === 0) {
      return [];
    }

    const picks: RefereePoolEntry[] = [];
    for (let i = 0; i < Math.min(refereesPerMatch, eligible.length); i++) {
      picks.push(eligible[(matchIndex + i) % eligible.length]);
    }
    return picks;
  }
}
