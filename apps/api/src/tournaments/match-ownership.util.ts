/**
 * A match belongs to exactly one of a group-stage Group or a knockout
 * KnockoutBracket, never both — this include/assert pair resolves the owning
 * tournamentId whichever one is set, so callers don't need two code paths.
 */
export const MATCH_TOURNAMENT_INCLUDE = {
  group: { include: { phase: { include: { category: true } } } },
  knockoutBracket: { include: { phase: { include: { category: true } } } },
} as const;

export interface MatchWithTournamentOwner {
  group: { phase: { category: { tournamentId: string } } } | null;
  knockoutBracket: { phase: { category: { tournamentId: string } } } | null;
}

export function matchTournamentId(
  match: MatchWithTournamentOwner,
): string | null {
  return (
    match.group?.phase.category.tournamentId ??
    match.knockoutBracket?.phase.category.tournamentId ??
    null
  );
}

export function matchBelongsToTournament(
  match: MatchWithTournamentOwner,
  tournamentId: string,
): boolean {
  return matchTournamentId(match) === tournamentId;
}
