import { Match } from './models';
import { roundLabelPlural } from './round-label.util';

export interface BracketRound {
  round: number;
  label: string;
  matches: Match[];
}

export interface BracketView {
  rounds: BracketRound[];
  thirdPlaceMatch: Match | null;
}

/** Groups a knockout bracket's matches by round, each with its French round label. */
export function buildBracketView(matches: Match[], totalRounds: number): BracketView {
  const thirdPlaceMatch = matches.find((match) => match.isThirdPlaceMatch) ?? null;
  const byRound = new Map<number, Match[]>();
  for (const match of matches) {
    if (match.isThirdPlaceMatch) {
      continue;
    }
    const list = byRound.get(match.round) ?? [];
    list.push(match);
    byRound.set(match.round, list);
  }
  const rounds = [...byRound.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round, roundMatches]) => ({
      round,
      label: roundLabelPlural(totalRounds - round),
      matches: roundMatches.sort((a, b) => (a.bracketSlot ?? 0) - (b.bracketSlot ?? 0)),
    }));
  return { rounds, thirdPlaceMatch };
}
