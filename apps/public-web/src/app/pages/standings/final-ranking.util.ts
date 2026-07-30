import { CompetitionPhase, Match } from '../../core/models';

export interface FinalRankingRow {
  position: number;
  teamId: string;
  teamName: string;
  phaseId: string;
  phaseName: string;
  stageLabel: string;
}

interface PhaseMatches {
  phase: CompetitionPhase;
  matches: Match[];
}

interface StageEntry {
  teamId: string;
  teamName: string;
  stageRank: number;
  stageLabel: string;
}

/**
 * Ranks teams by (bracket "value", i.e. the order its phase was given —
 * business-rules.md: "valeur du tableau atteint") then by how far they got
 * within that bracket. Not a points cumulative table: a semifinalist in the
 * top bracket always outranks the winner of a lesser one.
 */
export function computeFinalRanking(phasesWithMatches: PhaseMatches[]): FinalRankingRow[] {
  // Order is (phase order, i.e. bracket "value") then stage rank within it —
  // phasesWithMatches must already be given in descending bracket-value order.
  const ordered: FinalRankingRow[] = [];
  phasesWithMatches.forEach(({ phase, matches }) => {
    const totalRounds = Math.log2(phase.knockoutBracket?.size ?? 2);
    const entries = rankBracket(matches, totalRounds).sort(
      (a, b) => a.stageRank - b.stageRank || a.teamName.localeCompare(b.teamName),
    );
    for (const entry of entries) {
      ordered.push({
        position: 0,
        teamId: entry.teamId,
        teamName: entry.teamName,
        phaseId: phase.id,
        phaseName: phase.name,
        stageLabel: entry.stageLabel,
      });
    }
  });
  return ordered.map((row, index) => ({ ...row, position: index + 1 }));
}

function rankBracket(matches: Match[], totalRounds: number): StageEntry[] {
  const mainMatches = matches.filter((match) => !match.isThirdPlaceMatch);
  const thirdPlaceMatch = matches.find((match) => match.isThirdPlaceMatch);
  if (mainMatches.length === 0) {
    return [];
  }
  const final = mainMatches.find((match) => match.round === totalRounds);
  const entries: StageEntry[] = [];

  if (final) {
    const winnerId = getWinnerTeamId(final);
    const loserId = getLoserTeamId(final);
    if (winnerId && final.homeTeam && final.awayTeam) {
      entries.push(teamEntry(final, winnerId, 0, 'Vainqueur'));
    }
    if (loserId) {
      entries.push(teamEntry(final, loserId, 1, 'Finaliste'));
    }
  }

  if (thirdPlaceMatch) {
    const winnerId = getWinnerTeamId(thirdPlaceMatch);
    const loserId = getLoserTeamId(thirdPlaceMatch);
    if (winnerId) {
      entries.push(teamEntry(thirdPlaceMatch, winnerId, 2, '3e place'));
    }
    if (loserId) {
      entries.push(teamEntry(thirdPlaceMatch, loserId, 3, '4e place'));
    }
  }

  for (const match of mainMatches) {
    if (match.round === totalRounds) {
      continue;
    }
    // Semifinal losers are already ranked 3rd/4th via the ranking match above.
    if (match.round === totalRounds - 1 && thirdPlaceMatch) {
      continue;
    }
    const loserId = getLoserTeamId(match);
    if (!loserId) {
      continue;
    }
    const fromEnd = totalRounds - match.round;
    const stageRank = 4 + (fromEnd - 1) * 2;
    entries.push(teamEntry(match, loserId, stageRank, eliminationLabel(fromEnd)));
  }

  return entries;
}

function eliminationLabel(fromEnd: number): string {
  if (fromEnd === 1) {
    return 'Demi-finaliste éliminé';
  }
  if (fromEnd === 2) {
    return 'Quart de finaliste éliminé';
  }
  if (fromEnd === 3) {
    return 'Huitième de finaliste éliminé';
  }
  return `Éliminé (${fromEnd} tours avant la finale)`;
}

function teamEntry(
  match: Match,
  teamId: string,
  stageRank: number,
  stageLabel: string,
): StageEntry {
  const team = match.homeTeam?.id === teamId ? match.homeTeam : match.awayTeam;
  return { teamId, teamName: team?.name ?? '?', stageRank, stageLabel };
}

function getWinnerTeamId(match: Match): string | null {
  if (match.status === 'FORFEITED') {
    if (match.forfeitedTeam?.id === match.homeTeam?.id) {
      return match.awayTeam?.id ?? null;
    }
    if (match.forfeitedTeam?.id === match.awayTeam?.id) {
      return match.homeTeam?.id ?? null;
    }
    return null;
  }
  if (!match.score || !match.score.isValidated) {
    return null;
  }
  const { homeScore, awayScore, homePenaltyScore, awayPenaltyScore } = match.score;
  if (homeScore !== awayScore) {
    return homeScore > awayScore ? (match.homeTeam?.id ?? null) : (match.awayTeam?.id ?? null);
  }
  if (
    homePenaltyScore !== null &&
    awayPenaltyScore !== null &&
    homePenaltyScore !== awayPenaltyScore
  ) {
    return homePenaltyScore > awayPenaltyScore
      ? (match.homeTeam?.id ?? null)
      : (match.awayTeam?.id ?? null);
  }
  return null;
}

function getLoserTeamId(match: Match): string | null {
  const winnerId = getWinnerTeamId(match);
  if (!winnerId) {
    return null;
  }
  return winnerId === match.homeTeam?.id
    ? (match.awayTeam?.id ?? null)
    : (match.homeTeam?.id ?? null);
}
