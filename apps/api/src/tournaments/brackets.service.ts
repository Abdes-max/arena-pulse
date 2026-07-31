import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KnockoutBracket, MatchScore } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isPowerOfTwo, seedOrder } from './bracket-seeding.util';
import { MATCH_INCLUDE, toMatchSummary } from './match-summary.util';
import { StandingsService } from './standings.service';
import { TournamentsService } from './tournaments.service';

interface QualifiedEntry {
  teamId: string;
  position: number;
  groupName: string;
}

interface MatchOutcomeInput {
  homeTeamId: string | null;
  awayTeamId: string | null;
  forfeitedTeamId: string | null;
  status: string;
  score: Pick<
    MatchScore,
    | 'homeScore'
    | 'awayScore'
    | 'homePenaltyScore'
    | 'awayPenaltyScore'
    | 'isValidated'
  > | null;
}

@Injectable()
export class BracketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly standingsService: StandingsService,
  ) {}

  async generateMatches(
    organizationId: string,
    tournamentId: string,
    bracketId: string,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const bracket = await this.getOrThrowForTournament(tournamentId, bracketId);

    const existingCount = await this.prisma.match.count({
      where: { knockoutBracketId: bracketId },
    });
    if (existingCount > 0) {
      throw new ConflictException(
        'Les matchs de ce tableau ont déjà été générés.',
      );
    }
    if (!isPowerOfTwo(bracket.size)) {
      throw new BadRequestException(
        `La génération ne prend en charge que des tailles de tableau en puissance de deux (2, 4, 8, 16…) ; taille actuelle : ${bracket.size}.`,
      );
    }

    const qualified = await this.collectQualifiedTeams(
      organizationId,
      tournamentId,
      bracket.phaseId,
    );
    if (qualified.length !== bracket.size) {
      throw new BadRequestException(
        `Ce tableau attend ${bracket.size} équipes qualifiées ; ${qualified.length} sont disponibles pour l'instant.`,
      );
    }

    const order = seedOrder(bracket.size);
    const created = await this.prisma.$transaction(
      Array.from({ length: order.length / 2 }, (_, slot) => {
        const home = qualified[order[slot * 2] - 1];
        const away = qualified[order[slot * 2 + 1] - 1];
        return this.prisma.match.create({
          data: {
            knockoutBracketId: bracketId,
            round: 1,
            bracketSlot: slot,
            homeTeamId: home.teamId,
            awayTeamId: away.teamId,
          },
          include: MATCH_INCLUDE,
        });
      }),
    );
    return created.map((match) => toMatchSummary(match));
  }

  async listMatches(
    organizationId: string,
    tournamentId: string,
    bracketId: string,
  ) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    await this.getOrThrowForTournament(tournamentId, bracketId);
    const matches = await this.prisma.match.findMany({
      where: { knockoutBracketId: bracketId },
      include: MATCH_INCLUDE,
      orderBy: [{ round: 'asc' }, { bracketSlot: 'asc' }],
    });
    return matches.map((match) => toMatchSummary(match));
  }

  /**
   * Called after a knockout match's score is validated or it's forfeited.
   * Once every match in a round has a decided winner, seeds the next round
   * (and the 3rd-place match, if the bracket has one) from those winners —
   * a no-op if the round isn't finished yet, is already the final, or the
   * next round already exists (safe to call more than once per match).
   */
  async tryAdvanceRound(bracketId: string, round: number): Promise<void> {
    const bracket = await this.prisma.knockoutBracket.findUnique({
      where: { id: bracketId },
    });
    if (!bracket) {
      return;
    }
    const totalRounds = Math.log2(bracket.size);
    if (!Number.isInteger(totalRounds) || round >= totalRounds) {
      return;
    }

    const roundMatches = await this.prisma.match.findMany({
      where: { knockoutBracketId: bracketId, round, isThirdPlaceMatch: false },
      include: { score: true },
      orderBy: { bracketSlot: 'asc' },
    });
    if (roundMatches.length === 0) {
      return;
    }
    const outcomes = roundMatches.map((match) => ({
      match,
      winnerTeamId: this.getWinnerTeamId(match),
    }));
    if (outcomes.some((outcome) => outcome.winnerTeamId === null)) {
      return;
    }

    const nextRound = round + 1;
    const alreadyAdvanced = await this.prisma.match.count({
      where: { knockoutBracketId: bracketId, round: nextRound },
    });
    if (alreadyAdvanced > 0) {
      return;
    }

    const isSemifinalRound = nextRound === totalRounds;
    const rows: {
      knockoutBracketId: string;
      round: number;
      bracketSlot: number;
      isThirdPlaceMatch: boolean;
      homeTeamId: string | null;
      awayTeamId: string | null;
    }[] = [];
    for (let i = 0; i < outcomes.length; i += 2) {
      const home = outcomes[i];
      const away = outcomes[i + 1];
      const slot = i / 2;
      rows.push({
        knockoutBracketId: bracketId,
        round: nextRound,
        bracketSlot: slot,
        isThirdPlaceMatch: false,
        homeTeamId: home.winnerTeamId,
        awayTeamId: away.winnerTeamId,
      });
      if (isSemifinalRound && bracket.hasRankingMatch) {
        rows.push({
          knockoutBracketId: bracketId,
          round: nextRound,
          bracketSlot: slot,
          isThirdPlaceMatch: true,
          homeTeamId: this.getLoserTeamId(home.match),
          awayTeamId: this.getLoserTeamId(away.match),
        });
      }
    }
    await this.prisma.match.createMany({ data: rows });
  }

  private getWinnerTeamId(match: MatchOutcomeInput): string | null {
    if (match.status === 'FORFEITED') {
      if (match.forfeitedTeamId === match.homeTeamId) {
        return match.awayTeamId;
      }
      if (match.forfeitedTeamId === match.awayTeamId) {
        return match.homeTeamId;
      }
      return null;
    }
    if (!match.score || !match.score.isValidated) {
      return null;
    }
    const { homeScore, awayScore, homePenaltyScore, awayPenaltyScore } =
      match.score;
    if (homeScore !== awayScore) {
      return homeScore > awayScore ? match.homeTeamId : match.awayTeamId;
    }
    if (
      homePenaltyScore !== null &&
      awayPenaltyScore !== null &&
      homePenaltyScore !== awayPenaltyScore
    ) {
      return homePenaltyScore > awayPenaltyScore
        ? match.homeTeamId
        : match.awayTeamId;
    }
    return null;
  }

  private getLoserTeamId(match: MatchOutcomeInput): string | null {
    const winnerTeamId = this.getWinnerTeamId(match);
    if (!winnerTeamId) {
      return null;
    }
    return winnerTeamId === match.homeTeamId
      ? match.awayTeamId
      : match.homeTeamId;
  }

  private async collectQualifiedTeams(
    organizationId: string,
    tournamentId: string,
    targetPhaseId: string,
  ): Promise<QualifiedEntry[]> {
    const rules = await this.prisma.qualificationRule.findMany({
      where: { targetPhaseId },
      include: { group: { select: { name: true } } },
    });

    const standingsByGroupId = new Map<
      string,
      Awaited<ReturnType<StandingsService['getStandings']>>
    >();
    for (const rule of rules) {
      if (!standingsByGroupId.has(rule.groupId)) {
        standingsByGroupId.set(
          rule.groupId,
          await this.standingsService.getStandings(
            organizationId,
            tournamentId,
            rule.groupId,
          ),
        );
      }
    }

    const entries: QualifiedEntry[] = [];
    for (const rule of rules) {
      const { rows } = standingsByGroupId.get(rule.groupId)!;
      for (const row of rows) {
        if (
          row.position >= rule.fromPosition &&
          row.position <= rule.toPosition
        ) {
          entries.push({
            teamId: row.teamId,
            position: row.position,
            groupName: rule.group.name,
          });
        }
      }
    }
    entries.sort(
      (a, b) =>
        a.position - b.position || a.groupName.localeCompare(b.groupName),
    );
    return entries;
  }

  private async getOrThrowForTournament(
    tournamentId: string,
    bracketId: string,
  ): Promise<KnockoutBracket> {
    const bracket = await this.prisma.knockoutBracket.findUnique({
      where: { id: bracketId },
      include: { phase: { include: { category: true } } },
    });
    if (!bracket || bracket.phase.category.tournamentId !== tournamentId) {
      throw new NotFoundException('Tableau introuvable.');
    }
    return bracket;
  }
}
