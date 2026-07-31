import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Match, MatchScore } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BracketsService } from './brackets.service';
import { ForfeitMatchDto } from './dto/forfeit-match.dto';
import { UpsertMatchScoreDto } from './dto/upsert-match-score.dto';
import { matchBelongsToTournament } from './match-ownership.util';
import { MATCH_INCLUDE, toMatchSummary } from './match-summary.util';
import { TournamentsService } from './tournaments.service';

type MatchWithScoringData = Match & {
  score: MatchScore | null;
  group: {
    phase: { category: { tournamentId: string } };
    standingRule: { penaltyShootoutEnabled: boolean } | null;
  } | null;
  knockoutBracket: { phase: { category: { tournamentId: string } } } | null;
};

@Injectable()
export class ScoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly bracketsService: BracketsService,
  ) {}

  async upsertScore(
    organizationId: string,
    tournamentId: string,
    matchId: string,
    dto: UpsertMatchScoreDto,
    userId: string,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const match = await this.getOrThrowForTournament(tournamentId, matchId);
    if (match.status === 'FORFEITED') {
      throw new ConflictException(
        'Ce match est déclaré forfait — annulez le forfait avant de saisir un score.',
      );
    }
    this.assertPenaltyScoreShape(dto);

    await this.prisma.matchScore.upsert({
      where: { matchId },
      create: {
        matchId,
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        homePenaltyScore: dto.homePenaltyScore ?? null,
        awayPenaltyScore: dto.awayPenaltyScore ?? null,
        recordedById: userId,
      },
      update: {
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        homePenaltyScore: dto.homePenaltyScore ?? null,
        awayPenaltyScore: dto.awayPenaltyScore ?? null,
        isValidated: false,
        validatedAt: null,
        validatedById: null,
        recordedById: userId,
      },
    });

    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: { status: 'LIVE' },
      include: MATCH_INCLUDE,
    });
    return toMatchSummary(updated);
  }

  async validateScore(
    organizationId: string,
    tournamentId: string,
    matchId: string,
    userId: string,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const match = await this.getOrThrowForTournament(tournamentId, matchId);
    if (!match.score) {
      throw new BadRequestException('Aucun score saisi pour ce match.');
    }
    const isDraw = match.score.homeScore === match.score.awayScore;
    // A knockout match must always produce a winner; a group-stage draw only
    // needs a shootout if the group's StandingRule opts into one.
    const needsShootout =
      isDraw &&
      (match.knockoutBracket !== null ||
        Boolean(match.group?.standingRule?.penaltyShootoutEnabled));
    if (needsShootout && match.score.homePenaltyScore === null) {
      throw new BadRequestException(
        'Une séance de tirs au but est requise pour départager ce match nul.',
      );
    }
    if (
      match.score.homePenaltyScore !== null &&
      match.score.homePenaltyScore === match.score.awayPenaltyScore
    ) {
      throw new BadRequestException(
        'La séance de tirs au but doit désigner un vainqueur.',
      );
    }

    await this.prisma.matchScore.update({
      where: { matchId },
      data: {
        isValidated: true,
        validatedAt: new Date(),
        validatedById: userId,
      },
    });
    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: { status: 'COMPLETED' },
      include: MATCH_INCLUDE,
    });
    if (match.knockoutBracketId) {
      await this.bracketsService.tryAdvanceRound(
        match.knockoutBracketId,
        match.round,
      );
    }
    return toMatchSummary(updated);
  }

  async clearScore(
    organizationId: string,
    tournamentId: string,
    matchId: string,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const match = await this.getOrThrowForTournament(tournamentId, matchId);
    if (!match.score) {
      throw new NotFoundException('Aucun score saisi pour ce match.');
    }

    await this.prisma.matchScore.delete({ where: { matchId } });
    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: { status: 'SCHEDULED' },
      include: MATCH_INCLUDE,
    });
    return toMatchSummary(updated);
  }

  async declareForfeit(
    organizationId: string,
    tournamentId: string,
    matchId: string,
    dto: ForfeitMatchDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const match = await this.getOrThrowForTournament(tournamentId, matchId);
    if (dto.teamId !== match.homeTeamId && dto.teamId !== match.awayTeamId) {
      throw new BadRequestException(
        'Cette équipe ne participe pas à ce match.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.matchScore.deleteMany({ where: { matchId } }),
      this.prisma.match.update({
        where: { id: matchId },
        data: { status: 'FORFEITED', forfeitedTeamId: dto.teamId },
      }),
    ]);
    const updated = await this.prisma.match.findUniqueOrThrow({
      where: { id: matchId },
      include: MATCH_INCLUDE,
    });
    if (match.knockoutBracketId) {
      await this.bracketsService.tryAdvanceRound(
        match.knockoutBracketId,
        match.round,
      );
    }
    return toMatchSummary(updated);
  }

  async undoForfeit(
    organizationId: string,
    tournamentId: string,
    matchId: string,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const match = await this.getOrThrowForTournament(tournamentId, matchId);
    if (match.status !== 'FORFEITED') {
      throw new BadRequestException("Ce match n'est pas déclaré forfait.");
    }

    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: { status: 'SCHEDULED', forfeitedTeamId: null },
      include: MATCH_INCLUDE,
    });
    return toMatchSummary(updated);
  }

  private assertPenaltyScoreShape(dto: UpsertMatchScoreDto): void {
    const hasHomePenalty = dto.homePenaltyScore !== undefined;
    const hasAwayPenalty = dto.awayPenaltyScore !== undefined;
    if (hasHomePenalty !== hasAwayPenalty) {
      throw new BadRequestException(
        'Les scores de la séance de tirs au but doivent être saisis ensemble.',
      );
    }
    if (hasHomePenalty && dto.homeScore !== dto.awayScore) {
      throw new BadRequestException(
        'La séance de tirs au but ne concerne que les matchs nuls.',
      );
    }
  }

  private async getOrThrowForTournament(
    tournamentId: string,
    matchId: string,
  ): Promise<MatchWithScoringData> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      include: {
        score: true,
        group: {
          include: {
            phase: { include: { category: true } },
            standingRule: { select: { penaltyShootoutEnabled: true } },
          },
        },
        knockoutBracket: {
          include: { phase: { include: { category: true } } },
        },
      },
    });
    if (!match || !matchBelongsToTournament(match, tournamentId)) {
      throw new NotFoundException('Match introuvable.');
    }
    return match;
  }
}
