import { MatchScore } from '../../generated/prisma/client';

export interface MatchOutcomeInput {
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

export function getWinnerTeamId(match: MatchOutcomeInput): string | null {
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

export function getLoserTeamId(match: MatchOutcomeInput): string | null {
  const winnerTeamId = getWinnerTeamId(match);
  if (!winnerTeamId) {
    return null;
  }
  return winnerTeamId === match.homeTeamId
    ? match.awayTeamId
    : match.homeTeamId;
}
