import type { MatchStatus, TournamentStatus } from './models';

// Admin dashboard payloads (GET /organizations/:id/dashboard-stats and
// /organizations/:id/tournaments/:tid/stats) -- shared by the admin web and
// the organizer app, see the API's DashboardStatsService.

export interface RegistrationTotals {
  paid: number;
  pending: number;
  cancelled: number;
  revenueCents: number;
  currency: string;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface OrganizationDashboardStats {
  tournaments: { total: number; byStatus: Record<TournamentStatus, number> };
  teamsCount: number;
  playersCount: number;
  matches: { total: number; played: number; live: number };
  totalGoals: number;
  registrations: RegistrationTotals;
  upcoming: { id: string; name: string; startDate: string } | null;
  topTournaments: {
    id: string;
    name: string;
    status: TournamentStatus;
    teamsCount: number;
    matchesTotal: number;
    matchesPlayed: number;
  }[];
  matchesPlayedByMonth: { month: string; count: number }[];
}

export interface StatsMatchHighlight {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
}

export interface StatsTeamGoalTally {
  teamName: string;
  goals: number;
  matchesPlayed: number;
}

export interface TournamentDashboardStats {
  teamsCount: number;
  playersCount: number;
  categoriesCount: number;
  refereesCount: number;
  teamsByCategory: NamedCount[];
  matches: {
    total: number;
    scheduled: number;
    validated: number;
    awaitingValidation: number;
    byStatus: Record<MatchStatus, number>;
  };
  goals: {
    total: number;
    averagePerMatch: number;
    highestScoringMatch: StatsMatchHighlight | null;
    biggestWinMargin: StatsMatchHighlight | null;
  };
  outcomes: { homeWin: number; awayWin: number; draw: number; shootout: number };
  topAttack: StatsTeamGoalTally[];
  topDefense: StatsTeamGoalTally[];
  fields: NamedCount[];
  matchesByHour: NamedCount[];
  registrations: RegistrationTotals;
}
