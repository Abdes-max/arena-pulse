import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Match, MatchOfficial, TimeSlot } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecapRenderService } from '../recap/recap-render.service';
import { AddMatchOfficialDto } from './dto/add-match-official.dto';
import { AssignMatchTimeslotDto } from './dto/assign-match-timeslot.dto';
import {
  MATCH_TOURNAMENT_INCLUDE,
  matchBelongsToTournament,
  MatchWithTournamentOwner,
} from './match-ownership.util';
import { MATCH_INCLUDE, toMatchSummary } from './match-summary.util';
import { RefereesService } from './referees.service';
import { TeamsService } from './teams.service';
import { timeRangesOverlap } from './time-overlap.util';
import { TournamentsService } from './tournaments.service';

const MATCH_RECAP_INCLUDE = {
  ...MATCH_TOURNAMENT_INCLUDE,
  homeTeam: { select: { id: true, name: true } },
  awayTeam: { select: { id: true, name: true } },
  score: {
    select: { homeScore: true, awayScore: true, isValidated: true },
  },
  timeSlot: {
    include: { field: { include: { venue: { select: { name: true } } } } },
  },
} as const;

type MatchWithConflictData = Match &
  MatchWithTournamentOwner & {
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
    private readonly recapRenderService: RecapRenderService,
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
        match: { include: MATCH_TOURNAMENT_INCLUDE },
      },
    });
    if (!official || !matchBelongsToTournament(official.match, tournamentId)) {
      throw new NotFoundException('Officiel introuvable.');
    }
    await this.prisma.matchOfficial.delete({ where: { id: officialId } });
  }

  /**
   * Renders a short shareable video clip for a completed match, e.g. for the
   * organizer/teams to post on social media. Synchronous, in-process (see
   * RecapRenderService) -- no storage/caching, a fresh render every call.
   */
  async renderRecap(
    organizationId: string,
    tournamentId: string,
    matchId: string,
  ): Promise<Buffer> {
    const tournament = await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );

    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: MATCH_RECAP_INCLUDE,
    });
    if (!match || !matchBelongsToTournament(match, tournamentId)) {
      throw new NotFoundException('Match introuvable.');
    }
    if (match.status !== 'COMPLETED' || !match.score?.isValidated) {
      throw new BadRequestException(
        "Le récapitulatif vidéo n'est disponible que pour un match terminé au score validé.",
      );
    }
    if (!match.homeTeam || !match.awayTeam) {
      throw new BadRequestException(
        'Le récapitulatif vidéo nécessite deux équipes assignées.',
      );
    }

    return this.recapRenderService.renderMatchRecap({
      tournamentName: tournament.name,
      venueName: match.timeSlot?.field.venue.name ?? null,
      theme: tournament.theme,
      homeTeamName: match.homeTeam.name,
      awayTeamName: match.awayTeam.name,
      homeScore: match.score.homeScore,
      awayScore: match.score.awayScore,
    });
  }

  private async getOrThrowForTournament(
    tournamentId: string,
    matchId: string,
  ): Promise<MatchWithConflictData> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        ...MATCH_TOURNAMENT_INCLUDE,
        officials: true,
        timeSlot: true,
      },
    });
    if (!match || !matchBelongsToTournament(match, tournamentId)) {
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
