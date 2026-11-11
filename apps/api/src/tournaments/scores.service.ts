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
import { BatchMatchScoresDto } from './dto/batch-match-scores.dto';
import { UpsertMatchScoreDto } from './dto/upsert-match-score.dto';
import { matchBelongsToTournament } from './match-ownership.util';
import { MATCH_INCLUDE, toMatchSummary } from './match-summary.util';
import { PhaseScoresService } from './phase-scores.service';
import { RatingsService } from './ratings.service';
import { RealtimeService } from './realtime.service';
import { checkSets, resolveScoring, ScoringConfig } from './sets-score.util';
import { TournamentsService } from './tournaments.service';

interface PhaseWithScoring {
  setsToWin: number | null;
  category: {
    tournamentId: string;
    tournament: {
      sport: {
        scoreFormat: 'GOALS' | 'SETS';
        defaultSetsToWin: number | null;
      };
    };
  };
}

type MatchWithScoringData = Match & {
  score: MatchScore | null;
  group: {
    phase: PhaseWithScoring;
    standingRule: { penaltyShootoutEnabled: boolean } | null;
  } | null;
  knockoutBracket: { phase: PhaseWithScoring } | null;
};

/** What gets stored in MatchScore once the sport's score format is applied. */
interface NormalizedScore {
  homeScore: number;
  awayScore: number;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
  sets: { home: number; away: number }[] | null;
}

const SCORING_CATEGORY = {
  tournament: {
    select: {
      sport: { select: { scoreFormat: true, defaultSetsToWin: true } },
    },
  },
} as const;

@Injectable()
export class ScoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly bracketsService: BracketsService,
    private readonly phaseScoresService: PhaseScoresService,
    private readonly ratingsService: RatingsService,
    private readonly realtimeService: RealtimeService,
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
    await this.phaseScoresService.assertMatchScorable(matchId);
    if (match.status === 'FORFEITED') {
      throw new ConflictException(
        'Ce match est déclaré forfait, annulez le forfait avant de saisir un score.',
      );
    }
    const score = this.normalizeScore(match, dto, false);

    // Only sets sports carry a detail; goals sports leave the column null.
    const setsData = score.sets ? { sets: score.sets } : {};
    await this.prisma.matchScore.upsert({
      where: { matchId },
      create: {
        matchId,
        homeScore: score.homeScore,
        awayScore: score.awayScore,
        homePenaltyScore: score.homePenaltyScore,
        awayPenaltyScore: score.awayPenaltyScore,
        ...setsData,
        recordedById: userId,
      },
      update: {
        homeScore: score.homeScore,
        awayScore: score.awayScore,
        homePenaltyScore: score.homePenaltyScore,
        awayPenaltyScore: score.awayPenaltyScore,
        ...setsData,
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
    this.realtimeService.emit({ tournamentId, type: 'match-updated', matchId });
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
    await this.phaseScoresService.assertMatchScorable(matchId);
    if (!match.score) {
      throw new BadRequestException('Aucun score saisi pour ce match.');
    }
    this.assertValidatable(match, match.score);
    this.assertSetsComplete(match, match.score.sets);

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
    // Pool scores no longer draw the bracket by themselves: the organizer
    // validates the phase (PhaseScoresService.validatePoolScores).
    await this.ratingsService.recordMatchResult(organizationId, updated);
    this.realtimeService.emit({ tournamentId, type: 'match-updated', matchId });
    return toMatchSummary(updated);
  }

  /**
   * Saves (and, with `validate`, validates) the scores of a whole rotation in
   * one call -- the "Valider la série" button of the day-of page. Every entry
   * is checked before anything is written, so a mistake on one field doesn't
   * leave the rotation half-saved; the writes then go through upsertScore /
   * validateScore one by one so bracket advancement, ratings and realtime
   * events behave exactly as with single-match entry.
   */
  async upsertScores(
    organizationId: string,
    tournamentId: string,
    dto: BatchMatchScoresDto,
    userId: string,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    if (
      new Set(dto.scores.map((entry) => entry.matchId)).size !==
      dto.scores.length
    ) {
      throw new BadRequestException('Un même match apparaît deux fois.');
    }
    for (const entry of dto.scores) {
      const match = await this.getOrThrowForTournament(
        tournamentId,
        entry.matchId,
      );
      await this.phaseScoresService.assertMatchScorable(entry.matchId);
      if (match.status === 'FORFEITED') {
        throw new ConflictException(
          'Un match de la série est déclaré forfait, annulez le forfait avant de saisir un score.',
        );
      }
      const score = this.normalizeScore(match, entry, Boolean(dto.validate));
      if (dto.validate) {
        this.assertValidatable(match, score);
      }
    }

    const results: Awaited<ReturnType<ScoresService['upsertScore']>>[] = [];
    for (const { matchId, ...score } of dto.scores) {
      const saved = await this.upsertScore(
        organizationId,
        tournamentId,
        matchId,
        score,
        userId,
      );
      results.push(
        dto.validate
          ? await this.validateScore(
              organizationId,
              tournamentId,
              matchId,
              userId,
            )
          : saved,
      );
    }
    return results;
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
    await this.phaseScoresService.assertMatchScorable(matchId);
    if (!match.score) {
      throw new NotFoundException('Aucun score saisi pour ce match.');
    }

    await this.prisma.matchScore.delete({ where: { matchId } });
    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: { status: 'SCHEDULED' },
      include: MATCH_INCLUDE,
    });
    this.realtimeService.emit({ tournamentId, type: 'match-updated', matchId });
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
    await this.phaseScoresService.assertMatchScorable(matchId);
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
    await this.ratingsService.recordMatchResult(organizationId, updated);
    this.realtimeService.emit({ tournamentId, type: 'match-updated', matchId });
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
    await this.phaseScoresService.assertMatchScorable(matchId);
    if (match.status !== 'FORFEITED') {
      throw new BadRequestException("Ce match n'est pas déclaré forfait.");
    }

    const updated = await this.prisma.match.update({
      where: { id: matchId },
      data: { status: 'SCHEDULED', forfeitedTeamId: null },
      include: MATCH_INCLUDE,
    });
    this.realtimeService.emit({ tournamentId, type: 'match-updated', matchId });
    return toMatchSummary(updated);
  }

  /** Whether a score (saved or about to be) can be validated as a final result. */
  private assertValidatable(
    match: MatchWithScoringData,
    score: {
      homeScore: number;
      awayScore: number;
      homePenaltyScore: number | null;
      awayPenaltyScore: number | null;
    },
  ): void {
    const isDraw = score.homeScore === score.awayScore;
    // A knockout match must always produce a winner; a group-stage draw only
    // needs a shootout if the group's StandingRule opts into one.
    const needsShootout =
      isDraw &&
      (match.knockoutBracket !== null ||
        Boolean(match.group?.standingRule?.penaltyShootoutEnabled));
    if (needsShootout && score.homePenaltyScore === null) {
      throw new BadRequestException(
        'Une séance de tirs au but est requise pour départager ce match nul.',
      );
    }
    if (
      score.homePenaltyScore !== null &&
      score.homePenaltyScore === score.awayPenaltyScore
    ) {
      throw new BadRequestException(
        'La séance de tirs au but doit désigner un vainqueur.',
      );
    }
  }

  /**
   * Applies the sport's score format to what the client sent. GOALS keeps the
   * plain score and refuses `sets`. SETS needs `sets`, refuses shootouts, and
   * recomputes homeScore/awayScore as the sets won (the client's values are
   * ignored); `complete` demands a finished match rather than one in progress.
   */
  private normalizeScore(
    match: MatchWithScoringData,
    dto: UpsertMatchScoreDto,
    complete: boolean,
  ): NormalizedScore {
    const scoring = this.scoringFor(match);
    if (scoring.format === 'GOALS') {
      if (dto.sets !== undefined) {
        throw new BadRequestException(
          'Le détail des sets ne concerne que les sports à sets.',
        );
      }
      this.assertPenaltyScoreShape(dto);
      return {
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        homePenaltyScore: dto.homePenaltyScore ?? null,
        awayPenaltyScore: dto.awayPenaltyScore ?? null,
        sets: null,
      };
    }
    if (
      dto.homePenaltyScore !== undefined ||
      dto.awayPenaltyScore !== undefined
    ) {
      throw new BadRequestException('Pas de tirs au but dans un sport à sets.');
    }
    if (dto.sets === undefined) {
      throw new BadRequestException(
        'Le détail des sets est requis pour ce sport.',
      );
    }
    const sets = dto.sets.map(({ home, away }) => ({ home, away }));
    const won = checkSets(sets, scoring.setsToWin, complete);
    if ('error' in won) {
      throw new BadRequestException(won.error);
    }
    return {
      homeScore: won.home,
      awayScore: won.away,
      homePenaltyScore: null,
      awayPenaltyScore: null,
      sets,
    };
  }

  /** A stored sets score must be a finished match before it is validated. */
  private assertSetsComplete(
    match: MatchWithScoringData,
    stored: unknown,
  ): void {
    const scoring = this.scoringFor(match);
    if (scoring.format !== 'SETS') {
      return;
    }
    const sets = Array.isArray(stored)
      ? (stored as { home: number; away: number }[])
      : [];
    const result = checkSets(sets, scoring.setsToWin, true);
    if ('error' in result) {
      throw new BadRequestException(result.error);
    }
  }

  private scoringFor(match: MatchWithScoringData): ScoringConfig {
    const phase = (match.group?.phase ?? match.knockoutBracket?.phase)!;
    return resolveScoring({
      phaseSetsToWin: phase.setsToWin,
      sport: phase.category.tournament.sport,
    });
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
            phase: { include: { category: { include: SCORING_CATEGORY } } },
            standingRule: { select: { penaltyShootoutEnabled: true } },
          },
        },
        knockoutBracket: {
          include: {
            phase: { include: { category: { include: SCORING_CATEGORY } } },
          },
        },
      },
    });
    if (!match || !matchBelongsToTournament(match, tournamentId)) {
      throw new NotFoundException('Match introuvable.');
    }
    return match;
  }
}
