import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Match, MatchOfficial, TimeSlot } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddMatchOfficialDto } from './dto/add-match-official.dto';
import { AssignMatchTimeslotDto } from './dto/assign-match-timeslot.dto';
import { MATCH_INCLUDE, toMatchSummary } from './match-summary.util';
import { RefereesService } from './referees.service';
import { TeamsService } from './teams.service';
import { timeRangesOverlap } from './time-overlap.util';
import { TournamentsService } from './tournaments.service';

type MatchWithConflictData = Match & {
  group: { phase: { category: { tournamentId: string } } };
  officials: MatchOfficial[];
  timeSlot: TimeSlot | null;
};

interface OfficialIdentity {
  refereeId: string | null;
  refereeingTeamId: string | null;
}

@Injectable()
export class MatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly teamsService: TeamsService,
    private readonly refereesService: RefereesService,
  ) {}

  async moveMatch(
    organizationId: string,
    tournamentId: string,
    matchId: string,
    dto: AssignMatchTimeslotDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const match = await this.getOrThrowForTournament(tournamentId, matchId);

    if (dto.timeSlotId === null) {
      const updated = await this.prisma.match.update({
        where: { id: matchId },
        data: { timeSlotId: null },
        include: MATCH_INCLUDE,
      });
      return toMatchSummary(updated);
    }

    const targetSlot = await this.prisma.timeSlot.findUnique({
      where: { id: dto.timeSlotId },
      include: { field: { include: { venue: true } }, match: true },
    });
    if (!targetSlot || targetSlot.field.venue.tournamentId !== tournamentId) {
      throw new NotFoundException('Créneau introuvable.');
    }
    if (targetSlot.match && targetSlot.match.id !== matchId) {
      throw new ConflictException(
        'Ce créneau est déjà occupé par un autre match.',
      );
    }

    await this.assertNoTeamConflict(
      matchId,
      [match.homeTeamId, match.awayTeamId],
      targetSlot.startTime,
      targetSlot.endTime,
    );
    await this.assertNoOfficialConflict(
      matchId,
      match.officials,
      targetSlot.startTime,
      targetSlot.endTime,
    );

    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: { timeSlotId: dto.timeSlotId },
      include: MATCH_INCLUDE,
    });
    return toMatchSummary(updated);
  }

  async addOfficial(
    organizationId: string,
    tournamentId: string,
    matchId: string,
    dto: AddMatchOfficialDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const match = await this.getOrThrowForTournament(tournamentId, matchId);

    const hasReferee = dto.refereeId !== undefined;
    const hasTeam = dto.refereeingTeamId !== undefined;
    if (hasReferee === hasTeam) {
      throw new BadRequestException(
        'Fournir soit refereeId, soit refereeingTeamId.',
      );
    }

    if (hasReferee) {
      await this.refereesService.assertRefereeExists(
        tournamentId,
        dto.refereeId!,
      );
    } else {
      const team = await this.teamsService.assertTeamExists(
        tournamentId,
        dto.refereeingTeamId!,
      );
      if (team.id === match.homeTeamId || team.id === match.awayTeamId) {
        throw new BadRequestException(
          'Une équipe ne peut pas arbitrer son propre match.',
        );
      }
    }

    if (match.timeSlot) {
      await this.assertNoOfficialConflict(
        matchId,
        [
          {
            refereeId: dto.refereeId ?? null,
            refereeingTeamId: dto.refereeingTeamId ?? null,
          },
        ],
        match.timeSlot.startTime,
        match.timeSlot.endTime,
      );
    }

    await this.prisma.matchOfficial.create({
      data: {
        matchId,
        refereeId: dto.refereeId,
        refereeingTeamId: dto.refereeingTeamId,
      },
    });
    const updated = await this.prisma.match.findUniqueOrThrow({
      where: { id: matchId },
      include: MATCH_INCLUDE,
    });
    return toMatchSummary(updated);
  }

  async removeOfficial(
    organizationId: string,
    tournamentId: string,
    officialId: string,
  ): Promise<void> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const official = await this.prisma.matchOfficial.findUnique({
      where: { id: officialId },
      include: {
        match: {
          include: {
            group: { include: { phase: { include: { category: true } } } },
          },
        },
      },
    });
    if (
      !official ||
      official.match.group.phase.category.tournamentId !== tournamentId
    ) {
      throw new NotFoundException('Officiel introuvable.');
    }
    await this.prisma.matchOfficial.delete({ where: { id: officialId } });
  }

  private async getOrThrowForTournament(
    tournamentId: string,
    matchId: string,
  ): Promise<MatchWithConflictData> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        group: { include: { phase: { include: { category: true } } } },
        officials: true,
        timeSlot: true,
      },
    });
    if (!match || match.group.phase.category.tournamentId !== tournamentId) {
      throw new NotFoundException('Match introuvable.');
    }
    return match;
  }

  private async assertNoTeamConflict(
    matchId: string,
    teamIds: (string | null)[],
    start: Date,
    end: Date,
  ): Promise<void> {
    const ids = teamIds.filter((id): id is string => id !== null);
    if (ids.length === 0) {
      return;
    }
    const others = await this.prisma.match.findMany({
      where: {
        id: { not: matchId },
        timeSlot: { isNot: null },
        OR: [{ homeTeamId: { in: ids } }, { awayTeamId: { in: ids } }],
      },
      include: { timeSlot: true },
    });
    const conflict = others.some(
      (other) =>
        other.timeSlot &&
        timeRangesOverlap(
          start,
          end,
          other.timeSlot.startTime,
          other.timeSlot.endTime,
        ),
    );
    if (conflict) {
      throw new ConflictException(
        'Une des deux équipes est déjà engagée sur un autre match à ce créneau.',
      );
    }
  }

  private async assertNoOfficialConflict(
    matchId: string,
    officials: OfficialIdentity[],
    start: Date,
    end: Date,
  ): Promise<void> {
    const refereeIds = officials
      .map((o) => o.refereeId)
      .filter((id): id is string => id !== null);
    const teamIds = officials
      .map((o) => o.refereeingTeamId)
      .filter((id): id is string => id !== null);
    if (refereeIds.length === 0 && teamIds.length === 0) {
      return;
    }
    const others = await this.prisma.matchOfficial.findMany({
      where: {
        matchId: { not: matchId },
        OR: [
          ...(refereeIds.length > 0 ? [{ refereeId: { in: refereeIds } }] : []),
          ...(teamIds.length > 0
            ? [{ refereeingTeamId: { in: teamIds } }]
            : []),
        ],
      },
      include: { match: { include: { timeSlot: true } } },
    });
    const conflict = others.some(
      (other) =>
        other.match.timeSlot &&
        timeRangesOverlap(
          start,
          end,
          other.match.timeSlot.startTime,
          other.match.timeSlot.endTime,
        ),
    );
    if (conflict) {
      throw new ConflictException(
        'Un des officiels de ce match est déjà engagé sur un autre match à ce créneau.',
      );
    }
  }
}
