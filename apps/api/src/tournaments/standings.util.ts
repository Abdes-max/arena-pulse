export interface StandingRow {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  position: number;
}

interface TeamInput {
  id: string;
  name: string;
}

interface ValidatedMatchInput {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
}

interface PointsScheme {
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
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
): StandingRow[] {
  const statsByTeam = new Map<string, Stats>(
    teams.map((team) => [
      team.id,
      {
        teamId: team.id,
        teamName: team.name,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      },
    ]),
  );

  for (const match of matches) {
    applyResult(
      statsByTeam,
      match.homeTeamId,
      match.homeScore,
      match.awayScore,
      scheme,
    );
    applyResult(
      statsByTeam,
      match.awayTeamId,
      match.awayScore,
      match.homeScore,
      scheme,
    );
  }

  const ordered = resolveOrder(
    [...statsByTeam.values()],
    matches,
    tieBreakOrder,
    scheme,
  );
  return ordered.map((row, index) => ({ ...row, position: index + 1 }));
}

function applyResult(
  statsByTeam: Map<string, Stats>,
  teamId: string,
  scored: number,
  conceded: number,
  scheme: PointsScheme,
): void {
  const stats = statsByTeam.get(teamId);
  if (!stats) {
    return;
  }
  stats.played += 1;
  stats.goalsFor += scored;
  stats.goalsAgainst += conceded;
  stats.goalDifference = stats.goalsFor - stats.goalsAgainst;
  if (scored > conceded) {
    stats.won += 1;
    stats.points += scheme.winPoints;
  } else if (scored === conceded) {
    stats.drawn += 1;
    stats.points += scheme.drawPoints;
  } else {
    stats.lost += 1;
    stats.points += scheme.lossPoints;
  }
}

function resolveOrder(
  teams: Stats[],
  matches: ValidatedMatchInput[],
  criteria: string[],
  scheme: PointsScheme,
): Stats[] {
  if (teams.length <= 1) {
    return teams;
  }
  const [criterion, ...rest] = criteria;
  if (!criterion) {
    return [...teams].sort((a, b) => a.teamName.localeCompare(b.teamName));
  }

  const groups = groupByCriterion(teams, matches, criterion, scheme);
  return groups.flatMap((group) =>
    group.length > 1 ? resolveOrder(group, matches, rest, scheme) : group,
  );
}

function groupByCriterion(
  teams: Stats[],
  matches: ValidatedMatchInput[],
  criterion: string,
  scheme: PointsScheme,
): Stats[][] {
  const valueOf = criterionValueGetter(teams, matches, criterion, scheme);
  const sorted = [...teams].sort((a, b) => valueOf(b) - valueOf(a));
  const groups: Stats[][] = [];
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
    case 'GOAL_DIFFERENCE':
      return (team) => team.goalDifference;
    case 'GOALS_SCORED':
      return (team) => team.goalsFor;
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
        const homePoints =
          match.homeScore > match.awayScore
            ? scheme.winPoints
            : match.homeScore === match.awayScore
              ? scheme.drawPoints
              : scheme.lossPoints;
        const awayPoints =
          match.awayScore > match.homeScore
            ? scheme.winPoints
            : match.awayScore === match.homeScore
              ? scheme.drawPoints
              : scheme.lossPoints;
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
