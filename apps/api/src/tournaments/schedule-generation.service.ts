import { BadRequestException, Injectable } from '@nestjs/common';
import { CompetitionPhaseType, Match } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GenerateScheduleDto } from './dto/generate-schedule.dto';
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

type MatchWithRelations = Match & {
  homeTeam: { id: string; name: string } | null;
  awayTeam: { id: string; name: string } | null;
  timeSlot: {
    id: string;
    startTime: Date;
    endTime: Date;
    field: { id: string; name: string };
  } | null;
  officials: {
    id: string;
    referee: { id: string; firstName: string; lastName: string } | null;
    refereeingTeam: { id: string; name: string } | null;
  }[];
};

const MATCH_INCLUDE = {
  homeTeam: { select: { id: true, name: true } },
  awayTeam: { select: { id: true, name: true } },
  timeSlot: {
    include: { field: { select: { id: true, name: true } } },
  },
  officials: {
    include: {
      referee: { select: { id: true, firstName: true, lastName: true } },
      refereeingTeam: { select: { id: true, name: true } },
    },
  },
} as const;

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

    const fixtures: FlatFixture[] = groups.flatMap((group) =>
      generateRoundRobinFixtures(group.teams.map((team) => team.id)).map(
        (fixture) => ({ ...fixture, groupId: group.id }),
      ),
    );
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
    return matches.map((match) => this.toSummary(match));
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

    const matches = await this.prisma.match.findMany({
      where: { group: { phaseId } },
      select: { id: true, timeSlotId: true },
    });
    const timeSlotIds = matches
      .map((match) => match.timeSlotId)
      .filter((id): id is string => id !== null);

    await this.prisma.$transaction([
      this.prisma.matchOfficial.deleteMany({
        where: { matchId: { in: matches.map((match) => match.id) } },
      }),
      this.prisma.match.deleteMany({ where: { group: { phaseId } } }),
      this.prisma.timeSlot.deleteMany({ where: { id: { in: timeSlotIds } } }),
    ]);
  }

  async list(organizationId: string, tournamentId: string, phaseId: string) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    await this.phasesService.assertPhaseExists(tournamentId, phaseId);

    const matches = await this.prisma.match.findMany({
      where: { group: { phaseId } },
      include: MATCH_INCLUDE,
      orderBy: [{ timeSlot: { startTime: 'asc' } }],
    });
    return matches.map((match) => this.toSummary(match));
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

  private toSummary(match: MatchWithRelations) {
    return {
      id: match.id,
      groupId: match.groupId,
      round: match.round,
      status: match.status,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      timeSlot: match.timeSlot
        ? {
            id: match.timeSlot.id,
            startTime: match.timeSlot.startTime,
            endTime: match.timeSlot.endTime,
            field: match.timeSlot.field,
          }
        : null,
      officials: match.officials.map((official) => ({
        id: official.id,
        referee: official.referee,
        refereeingTeam: official.refereeingTeam,
      })),
    };
  }
}
