export interface StandingRow {
  teamId: string;
  teamName: string;
  teamLogoUrl: string | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  // SETS format only (0 otherwise): games/points won and lost inside the
  // sets. goalsFor/goalsAgainst then count the sets won and lost.
  gamesFor: number;
  gamesAgainst: number;
  gameDifference: number;
  points: number;
  position: number;
}

interface TeamInput {
  id: string;
  name: string;
  // Optional so pre-existing test fixtures across this file's spec don't
  // all need updating for a field they don't assert on -- real callers
  // (standings.service.ts) always provide it.
  logoUrl?: string | null;
}

interface ValidatedMatchInput {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  // SETS format only: the detail of each set.
  sets?: { home: number; away: number }[] | null;
}

interface PointsScheme {
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  // SETS format: points when the match went to the deciding set (e.g.
  // volleyball 3-2 -> 2 for the winner, 1 for the loser). Absent/null = the
  // normal win/loss points.
  decidingSetWinPoints?: number | null;
  decidingSetLossPoints?: number | null;
}

type Stats = Omit<StandingRow, 'position'>;

/**
 * Standings are a calculated view, not stored data (docs/architecture/
 * data-model.md): recomputed here from validated scores rather than kept
 * denormalized, so they can never drift from the underlying match results.
 */
export function computeStandings(
  teams: TeamInput[],
  matches: ValidatedMatchInput[],
  scheme: PointsScheme,
  tieBreakOrder: string[],
  manualTieBreakOrder: string[] = [],
): StandingRow[] {
  const statsByTeam = new Map<string, Stats>(
    teams.map((team) => [
      team.id,
      {
        teamId: team.id,
        teamName: team.name,
        teamLogoUrl: team.logoUrl ?? null,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        gamesFor: 0,
        gamesAgainst: 0,
        gameDifference: 0,
        points: 0,
      },
    ]),
  );

  for (const match of matches) {
    const games = sumGames(match.sets);
    applyResult(
      statsByTeam,
      match.homeTeamId,
      match.homeScore,
      match.awayScore,
      scheme,
      games.home,
      games.away,
    );
    applyResult(
      statsByTeam,
      match.awayTeamId,
      match.awayScore,
      match.homeScore,
      scheme,
      games.away,
      games.home,
    );
  }

  const ordered = resolveOrder(
    [...statsByTeam.values()],
    matches,
    tieBreakOrder,
    scheme,
    manualTieBreakOrder,
  );
  return ordered.map((row, index) => ({ ...row, position: index + 1 }));
}

export interface CrossGroupCandidate extends StandingRow {
  groupId: string;
  groupName: string;
}

/**
 * Ranks the row at `position` from each pool's own standings against each
 * other (e.g. every pool's 3rd place, to pick the best N across all of
 * them) -- reuses the same tie-break engine as computeStandings, with an
 * empty match list. HEAD_TO_HEAD naturally becomes a no-op that way (these
 * teams never played each other, so it can never discriminate between
 * them), falling through to the next criterion untouched rather than
 * needing the caller to filter it out of tieBreakOrder first.
 */
export function rankCrossGroupCandidates(
  pools: { groupId: string; groupName: string; rows: StandingRow[] }[],
  position: number,
  tieBreakOrder: string[],
  manualTieBreakOrder: string[] = [],
): CrossGroupCandidate[] {
  const candidates = pools.flatMap(({ groupId, groupName, rows }) => {
    const row = rows.find((r) => r.position === position);
    return row ? [{ ...row, groupId, groupName }] : [];
  });

  const ordered = resolveOrder(
    candidates,
    [],
    tieBreakOrder,
    { winPoints: 0, drawPoints: 0, lossPoints: 0 },
    manualTieBreakOrder,
  );
  return ordered.map((row, index) => ({ ...row, position: index + 1 }));
}

function sumGames(sets: ValidatedMatchInput['sets']): {
  home: number;
  away: number;
} {
  let home = 0;
  let away = 0;
  for (const set of sets ?? []) {
    home += set.home;
    away += set.away;
  }
  return { home, away };
}

// A match went to the deciding set when the winner has n sets and the loser
// n - 1 (2-1 in best of 3, 3-2 in best of 5). A single set (1-0) never counts.
function isDecidingSetMatch(scored: number, conceded: number): boolean {
  const winner = Math.max(scored, conceded);
  return winner >= 2 && Math.min(scored, conceded) === winner - 1;
}

function resultPoints(
  scored: number,
  conceded: number,
  scheme: PointsScheme,
): number {
  const deciding = isDecidingSetMatch(scored, conceded);
  if (scored > conceded) {
    return deciding
      ? (scheme.decidingSetWinPoints ?? scheme.winPoints)
      : scheme.winPoints;
  }
  if (scored === conceded) {
    return scheme.drawPoints;
  }
  return deciding
    ? (scheme.decidingSetLossPoints ?? scheme.lossPoints)
    : scheme.lossPoints;
}

function applyResult(
  statsByTeam: Map<string, Stats>,
  teamId: string,
  scored: number,
  conceded: number,
  scheme: PointsScheme,
  gamesScored = 0,
  gamesConceded = 0,
): void {
  const stats = statsByTeam.get(teamId);
  if (!stats) {
    return;
  }
  stats.played += 1;
  stats.goalsFor += scored;
  stats.goalsAgainst += conceded;
  stats.goalDifference = stats.goalsFor - stats.goalsAgainst;
  stats.gamesFor += gamesScored;
  stats.gamesAgainst += gamesConceded;
  stats.gameDifference = stats.gamesFor - stats.gamesAgainst;
  stats.points += resultPoints(scored, conceded, scheme);
  if (scored > conceded) {
    stats.won += 1;
  } else if (scored === conceded) {
    stats.drawn += 1;
  } else {
    stats.lost += 1;
  }
}

function resolveOrder<T extends Stats>(
  teams: T[],
  matches: ValidatedMatchInput[],
  criteria: string[],
  scheme: PointsScheme,
  manualOrder: string[] = [],
): T[] {
  if (teams.length <= 1) {
    return teams;
  }
  const [criterion, ...rest] = criteria;
  if (!criterion) {
    return [...teams].sort((a, b) => {
      const manualDiff =
        manualRank(a.teamId, manualOrder) - manualRank(b.teamId, manualOrder);
      return manualDiff !== 0
        ? manualDiff
        : a.teamName.localeCompare(b.teamName);
    });
  }

  const groups = groupByCriterion(teams, matches, criterion, scheme);
  return groups.flatMap((group) =>
    group.length > 1
      ? resolveOrder(group, matches, rest, scheme, manualOrder)
      : group,
  );
}

// Explicit organizer pick (StandingRule/CrossGroupQualificationRule's
// manualTieBreakOrder) wins over the plain alphabetical fallback once every
// scoring criterion is exhausted -- teams not yet picked share the same
// (maximum) rank, so they stay grouped as a still-unresolved tie rather than
// silently reordered.
function manualRank(teamId: string, manualOrder: string[]): number {
  const index = manualOrder.indexOf(teamId);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

/**
 * Every group of 2+ teams that reach the alphabetical fallback with no
 * organizer pick between them -- i.e. every configured tieBreakOrder
 * criterion (and manualOrder) left them genuinely indistinguishable. Used to
 * surface a "tie to resolve manually" prompt (Classement page) instead of
 * silently ordering them alphabetically, and to withhold a qualification
 * slot's real team (BracketsService.resolveQualificationSlots) while the tie
 * could still affect who qualifies.
 */
export function findUnresolvedTies<T extends Stats>(
  teams: T[],
  matches: ValidatedMatchInput[],
  criteria: string[],
  scheme: PointsScheme,
  manualOrder: string[] = [],
): string[][] {
  const ties: string[][] = [];
  collectUnresolvedTies(teams, matches, criteria, scheme, manualOrder, ties);
  return ties;
}

function collectUnresolvedTies<T extends Stats>(
  teams: T[],
  matches: ValidatedMatchInput[],
  criteria: string[],
  scheme: PointsScheme,
  manualOrder: string[],
  ties: string[][],
): void {
  if (teams.length <= 1) {
    return;
  }
  const [criterion, ...rest] = criteria;
  if (!criterion) {
    for (const group of groupByManualRank(teams, manualOrder)) {
      if (group.length > 1) {
        ties.push(group.map((team) => team.teamId));
      }
    }
    return;
  }

  const groups = groupByCriterion(teams, matches, criterion, scheme);
  for (const group of groups) {
    if (group.length > 1) {
      collectUnresolvedTies(group, matches, rest, scheme, manualOrder, ties);
    }
  }
}

function groupByManualRank<T extends Stats>(
  teams: T[],
  manualOrder: string[],
): T[][] {
  const rankOf = (team: T) => manualRank(team.teamId, manualOrder);
  const sorted = [...teams].sort((a, b) => rankOf(a) - rankOf(b));
  const groups: T[][] = [];
  for (const team of sorted) {
    const last = groups[groups.length - 1];
    if (last && rankOf(last[0]) === rankOf(team)) {
      last.push(team);
    } else {
      groups.push([team]);
    }
  }
  return groups;
}

function groupByCriterion<T extends Stats>(
  teams: T[],
  matches: ValidatedMatchInput[],
  criterion: string,
  scheme: PointsScheme,
): T[][] {
  const valueOf = criterionValueGetter(teams, matches, criterion, scheme);
  const sorted = [...teams].sort((a, b) => valueOf(b) - valueOf(a));
  const groups: T[][] = [];
  for (const team of sorted) {
    const last = groups[groups.length - 1];
    if (last && valueOf(last[0]) === valueOf(team)) {
      last.push(team);
    } else {
      groups.push([team]);
    }
  }
  return groups;
}

function criterionValueGetter(
  teams: Stats[],
  matches: ValidatedMatchInput[],
  criterion: string,
  scheme: PointsScheme,
): (team: Stats) => number {
  switch (criterion) {
    case 'POINTS':
      return (team) => team.points;
    // In SETS mode goalsFor/goalDifference hold the sets won/difference, so
    // the set criteria read the same columns under their own names.
    case 'GOAL_DIFFERENCE':
    case 'SET_DIFFERENCE':
      return (team) => team.goalDifference;
    case 'GOALS_SCORED':
    case 'SETS_WON':
      return (team) => team.goalsFor;
    case 'GAME_DIFFERENCE':
      return (team) => team.gameDifference;
    case 'HEAD_TO_HEAD': {
      const subgroupIds = new Set(teams.map((team) => team.teamId));
      const headToHeadPoints = new Map<string, number>();
      for (const match of matches) {
        if (
          !subgroupIds.has(match.homeTeamId) ||
          !subgroupIds.has(match.awayTeamId)
        ) {
          continue;
        }
        const homePoints = resultPoints(
          match.homeScore,
          match.awayScore,
          scheme,
        );
        const awayPoints = resultPoints(
          match.awayScore,
          match.homeScore,
          scheme,
        );
        headToHeadPoints.set(
          match.homeTeamId,
          (headToHeadPoints.get(match.homeTeamId) ?? 0) + homePoints,
        );
        headToHeadPoints.set(
          match.awayTeamId,
          (headToHeadPoints.get(match.awayTeamId) ?? 0) + awayPoints,
        );
      }
      return (team) => headToHeadPoints.get(team.teamId) ?? 0;
    }
    default:
      return () => 0;
  }
}
