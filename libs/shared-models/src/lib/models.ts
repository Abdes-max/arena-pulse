export type TournamentStatus = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'ARCHIVED';

/** Visual theme of this tournament's public site + slideshow, chosen by its organizer. */
export type PublicTheme = 'INK_SIGNAL' | 'PULSE_EMBER' | 'NEON_COURT';

export interface Field {
  id: string;
  name: string;
  surface: string | null;
  position: number;
}

export interface Venue {
  id: string;
  name: string;
  address: string | null;
  position: number;
  fields: Field[];
}

export interface PublicTournament {
  id: string;
  name: string;
  slug: string;
  status: TournamentStatus;
  sportName: string;
  startDate: string | null;
  endDate: string | null;
  isOnline: boolean;
  theme: PublicTheme;
  venues: Venue[];
}

export interface Category {
  id: string;
  name: string;
  position: number;
  // Null = free to join (no online registration/payment step required).
  // Smallest currency unit (cents), matching Stripe's own convention.
  registrationFeeCents: number | null;
  registrationFeeCurrency: string | null;
}

export type CompetitionPhaseType = 'GROUP_STAGE' | 'KNOCKOUT';

export interface KnockoutBracket {
  id: string;
  phaseId: string;
  name: string;
  size: number;
  hasRankingMatch: boolean;
}

export interface CompetitionGroup {
  id: string;
  phaseId: string;
  name: string;
  position: number;
}

export interface CompetitionPhase {
  id: string;
  name: string;
  type: CompetitionPhaseType;
  position: number;
  groups: CompetitionGroup[];
  knockoutBracket: KnockoutBracket | null;
}

export interface PublicTeam {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  divisionId: string | null;
  divisionName: string | null;
  groupId: string | null;
  groupName: string | null;
  position: number;
}

export type MatchStatus =
  'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'POSTPONED' | 'CANCELLED' | 'FORFEITED';

export interface MatchOfficial {
  id: string;
  referee: { id: string; firstName: string; lastName: string } | null;
  refereeingTeam: { id: string; name: string } | null;
}

export interface MatchScore {
  homeScore: number;
  awayScore: number;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
  isValidated: boolean;
  validatedAt: string | null;
}

export interface Match {
  id: string;
  groupId: string | null;
  knockoutBracketId: string | null;
  bracketSlot: number | null;
  isThirdPlaceMatch: boolean;
  round: number;
  status: MatchStatus;
  homeTeam: { id: string; name: string } | null;
  awayTeam: { id: string; name: string } | null;
  // Display-only placeholder shown while the real team above is still
  // unknown (e.g. "1er Poule A", "Vainqueur Quart de finale 1") -- always
  // null once the corresponding team is known.
  homeSourceLabel: string | null;
  awaySourceLabel: string | null;
  forfeitedTeam: { id: string; name: string } | null;
  timeSlot: {
    id: string;
    startTime: string;
    endTime: string;
    field: { id: string; name: string };
  } | null;
  officials: MatchOfficial[];
  score: MatchScore | null;
}

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
  // Persistent Glicko-2 rating for this team within the organization (not
  // reset per tournament, unlike the columns above) -- a complement to the
  // points classement, not a replacement.
  rating: number;
  ratingDeviation: number;
  isProvisional: boolean;
}

// A group of 2+ teams still genuinely tied (every scoring criterion, and any
// earlier organizer pick, exhausted) -- currently ordered alphabetically
// among themselves within `rows` above, pending a manual pick.
export interface UnresolvedTie {
  teams: { id: string; name: string }[];
}

export interface Standings {
  rows: StandingRow[];
  isComplete: boolean;
  unresolvedTies: UnresolvedTie[];
}

export interface Qualification {
  ruleId: string;
  fromPosition: number;
  toPosition: number;
  targetPhaseId: string;
  targetPhaseName: string;
  qualifiedTeams: { id: string; name: string; position: number }[];
}

export interface PublicTeamDetail extends PublicTeam {
  // knockoutTotalRounds is only populated here (not on other match-list
  // endpoints, which already know their bracket's size from the currently
  // selected phase) -- lets a team's page compute a round label (see
  // round-label.util.ts) without a second phases fetch, since a team's own
  // match history can span several different-sized brackets.
  matches: (Match & { knockoutTotalRounds: number | null })[];
  standing: StandingRow | null;
}

// --- Player accounts + online registration + payments (feat/036) ---

export interface PlayerAccount {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface RegistrationPlayerInput {
  firstName: string;
  lastName: string;
  jerseyNumber?: number;
}

export interface CreateRegistrationPayload {
  teamName: string;
  managerEmail: string;
  managerPhone?: string;
  players: RegistrationPlayerInput[];
}

export type RegistrationStatus = 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED';

export interface CreateRegistrationResult {
  registrationId: string;
  status: RegistrationStatus;
  checkoutUrl: string | null;
}

/** A player's own registration, as returned by GET /public/registrations/me. */
export interface PlayerRegistration {
  id: string;
  teamName: string;
  status: RegistrationStatus;
  amountCents: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  tournament: { slug: string; name: string };
  category: { id: string; name: string };
}

/** A registration as seen by the organizer, as returned by GET .../registrations. */
export interface OrganizerRegistration {
  id: string;
  teamName: string;
  categoryId: string;
  categoryName: string;
  managerEmail: string;
  managerPhone: string | null;
  status: RegistrationStatus;
  amountCents: number;
  currency: string;
  teamId: string | null;
  createdAt: string;
  paidAt: string | null;
  registrant: { firstName: string; lastName: string; email: string };
  players: RegistrationPlayerInput[];
}
