export type TournamentStatus = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'ARCHIVED';

/** Visual theme of this tournament's public site + slideshow, chosen by its organizer. */
export type PublicTheme =
  'INK_SIGNAL' | 'PULSE_EMBER' | 'NEON_COURT' | 'FRESH_PITCH' | 'CRIMSON_CHARGE';

// Sport catalog is global, not per-organization -- publicly readable (the
// landing page's "Sports" nav dropdown lists these for a logged-out
// visitor, see sports.controller.ts).
// How a match result is recorded: one score per side ("GOALS") or the
// detail of each set ("SETS": padel, tennis, volleyball, badminton). In SETS
// mode MatchScore.homeScore/awayScore are the sets won.
export type ScoreFormat = 'GOALS' | 'SETS';

/** One set (or game, for sports that count points in a set): home vs away. */
export interface SetScore {
  home: number;
  away: number;
}

export interface PublicSport {
  id: string;
  name: string;
  scoreFormat: ScoreFormat;
  // Sets a side must win to take a match (best of 2n-1); null for GOALS sports.
  defaultSetsToWin: number | null;
}

// Public contact form (landing page footer) -- no persistence, this is
// relayed straight to an inbox by the API (see contact.controller.ts).
export interface ContactMessagePayload {
  name: string;
  email: string;
  subject: string;
  message: string;
}

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

export interface Sponsor {
  id: string;
  name: string;
  logoUrl: string | null;
  linkUrl: string | null;
  position: number;
}

/** One row of the public tournament directory (home page card lists) -- see PublicTournament for a single tournament's full detail. */
export interface PublicTournamentSummary {
  id: string;
  name: string;
  slug: string;
  sportName: string;
  scoreFormat: ScoreFormat;
  defaultSetsToWin: number | null;
  startDate: string | null;
  endDate: string | null;
  // End time of the latest scheduled match, when the tournament has no
  // endDate of its own -- lets a card list tell an already-played
  // undated tournament apart from a genuinely upcoming one (see
  // landing.page.ts's marqueeTournaments).
  lastMatchDate: string | null;
  isOnline: boolean;
  // Null for an online tournament, or a physical one with no venue address
  // recorded yet -- the card simply omits the location line in that case.
  location: string | null;
  logoUrl: string | null;
}

/** One row of the public directory search (`GET /public/tournaments/search`) -- unlike PublicTournamentSummary, carries the organizer's name (shown on each result card) since a directory search spans every organization, not just this site's own recent list. */
export interface PublicTournamentDirectoryItem extends PublicTournamentSummary {
  organizerName: string;
  /** Card details, e.g. "5 contre 5" and "Elite". */
  format?: string | null;
  level?: string | null;
  /** Set while the tournament takes pre-registrations: places held / total (null = unlimited) and the lowest price. */
  registration?: {
    taken: number;
    total: number | null;
    feeCents: number | null;
    currency: string;
  } | null;
}

/** Query params accepted by `GET /public/tournaments/search`. All optional except pagination. */
export interface PublicTournamentSearchQuery {
  q?: string;
  sportId?: string;
  location?: string;
  dateFrom?: string;
  /** Only events still to come (or running), or only those already over. */
  time?: 'upcoming' | 'past';
  /** Only tournaments taking pre-registrations right now. */
  registration?: 'open';
  page: number;
  pageSize: number;
}

export interface PublicTournamentSearchResult {
  items: PublicTournamentDirectoryItem[];
  total: number;
}

export interface PublicTournament {
  id: string;
  name: string;
  slug: string;
  status: TournamentStatus;
  sportName: string;
  scoreFormat: ScoreFormat;
  defaultSetsToWin: number | null;
  startDate: string | null;
  endDate: string | null;
  // Earliest scheduled match's kickoff time, across the whole tournament --
  // startDate itself carries no real time-of-day (always set at UTC
  // midnight by the Général form), so TournamentShell's own formattedDates()
  // appends this one next to the start date when it's known.
  firstMatchTime: string | null;
  // When the last scheduled match ends (the poster's "Fin prévue").
  lastMatchEndTime: string | null;
  isOnline: boolean;
  theme: PublicTheme;
  logoUrl: string | null;
  // Wide photo behind the public site's header (TournamentShell hero) and
  // the portrait poster/flyer shown on the "Tournoi" page -- both null
  // until the organizer uploads one, same premium gate as logoUrl.
  headerBackgroundUrl: string | null;
  posterUrl: string | null;
  description: string | null;
  rules: string | null;
  practicalInfo: string | null;
  venues: Venue[];
  sponsors: Sponsor[];
  // Drives whether TournamentShell shows the "Récap" tab -- same
  // TournamentsService.hasPremiumFeatures check as theme/logo/QR/export
  // (active annual subscription, or more teams than the free tier allows).
  wrappedUnlocked: boolean;
  // Every match played (or forfeited/cancelled): the public site then
  // opens on Classement > Classement final instead of the home page.
  isFinished: boolean;
}

/** One highlighted match on the Wrapped recap (biggest score, closest game, etc.) -- see WrappedMatchStats server-side. */
export interface WrappedMatchHighlight {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  homePenaltyScore: number | null;
  awayPenaltyScore: number | null;
}

export interface WrappedNamedCount {
  name: string;
  count: number;
}

export interface WrappedTeamGoalTally {
  teamName: string;
  goals: number;
  matchesPlayed: number;
}

export interface WrappedOutcomeBreakdown {
  homeWin: number;
  awayWin: number;
  draw: number;
  shootout: number;
}

export interface WrappedChampion {
  categoryId: string;
  categoryName: string;
  teamName: string;
  rating: number;
}

export interface WrappedUpset {
  winnerTeamName: string;
  loserTeamName: string;
  winnerRatingBefore: number;
  loserRatingBefore: number;
}

/**
 * GET /public/tournaments/:slug/wrapped -- the "Tournoi Wrapped" end-of-
 * event recap (see the plan doc "Tournoi Wrapped" for the full design).
 * `unlocked: false` carries no other field on purpose: a public page must
 * never leak an organizer's stats just because it computed them before
 * finding out the tournament isn't on the paid tier.
 */
export type TournamentWrapped =
  | { unlocked: false }
  | {
      unlocked: true;
      organisation: {
        teamsCount: number;
        categoriesCount: number;
        groupsCount: number;
        venuesCount: number;
        refereesCount: number;
        startDate: string | null;
        endDate: string | null;
      };
      goals: {
        totalGoals: number;
        averageGoalsPerMatch: number;
        matchesPlayed: number;
        highestScoringMatch: WrappedMatchHighlight | null;
        biggestWinMargin: WrappedMatchHighlight | null;
        closestMatch: WrappedMatchHighlight | null;
      };
      outcomes: WrappedOutcomeBreakdown;
      venues: WrappedNamedCount[];
      matchesByHour: WrappedNamedCount[];
      topAttack: WrappedTeamGoalTally[];
      topDefense: WrappedTeamGoalTally[];
      level: {
        champions: WrappedChampion[];
        biggestUpset: WrappedUpset | null;
      };
    };

export interface Category {
  id: string;
  name: string;
  position: number;
  // Null = free to join (no online registration/payment step required).
  // Smallest currency unit (cents), matching Stripe's own convention.
  registrationFeeCents: number | null;
  registrationFeeCurrency: string | null;
  /** Places for pre-registrations; null = unlimited. */
  maxTeams?: number | null;
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
  // True for the fictitious pool phase a KNOCKOUT_ONLY structure preset
  // creates just to seed its bracket from -- no match is ever generated in
  // it, so it should never surface as a real "Poules"/"Classement" tab.
  isSeedPhase: boolean;
  // Organizer endpoints only: planned length of one match in this phase.
  matchDurationMinutes?: number;
  // Organizer endpoints only. A pool phase feeding a knockout phase has its
  // scores validated by the organizer (which draws the bracket); until then
  // the knockout scores are locked, and once validated the pool scores are.
  feedsKnockout?: boolean;
  scoresValidatedAt?: string | null;
  // Sets sports (organizer endpoints only): sets a side must win in this
  // phase; null = the sport's default.
  setsToWin?: number | null;
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
  // Path relative to the API origin (e.g. /uploads/team-logos/x.png) --
  // resolveAssetUrl() turns this into a fetchable URL from any app.
  logoUrl: string | null;
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
  // SETS format only: the detail of each set, in play order.
  sets: SetScore[] | null;
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
  homeTeam: { id: string; name: string; logoUrl: string | null } | null;
  awayTeam: { id: string; name: string; logoUrl: string | null } | null;
  // Display-only placeholder shown while the real team above is still
  // unknown (e.g. "1er Poule A", "Vainqueur Quart de finale 1") -- always
  // null once the corresponding team is known.
  homeSourceLabel: string | null;
  awaySourceLabel: string | null;
  forfeitedTeam: { id: string; name: string; logoUrl: string | null } | null;
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
  /** Team sports only (an individual registration is named after its player). */
  teamName?: string;
  // Team sports: club picked from the directory (its crest becomes the team logo).
  externalClubId?: string;
  // Team sports: several teams at once, numbered "<teamName> 1", "<teamName> 2"...
  teamCount?: number;
  managerEmail: string;
  // Required: the organizer calls the manager (or player) back.
  managerPhone: string;
  // Individual sports: the single player. Team sports register the team only.
  players?: RegistrationPlayerInput[];
}

export type RegistrationStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'WAITLIST'
  | 'REJECTED'
  | 'CANCELLED'
  // Former online-payment flow.
  | 'PENDING_PAYMENT'
  | 'PAID';

export type RegistrationPaymentStatus = 'UNPAID' | 'PAID' | 'EXEMPT';
export type ParticipantType = 'TEAM' | 'INDIVIDUAL';

/** GET /public/tournaments/:slug/registration-info */
export interface PublicRegistrationInfo {
  open: boolean;
  opensAt: string | null;
  closesAt: string | null;
  paymentInfo: string | null;
  participantType: ParticipantType;
  /** Teams one team manager may register (set by the organizer, 1 by default). */
  maxTeamsPerRegistrant: number;
  categories: {
    id: string;
    name: string;
    feeCents: number | null;
    currency: string;
    maxTeams: number | null;
    remaining: number | null;
  }[];
}

/** Organizer side: GET/PATCH …/registrations/settings */
export interface RegistrationSettings {
  /** The public sign-up page is /:slug/register, reachable once published. */
  slug: string;
  published: boolean;
  open: boolean;
  openNow: boolean;
  opensAt: string | null;
  closesAt: string | null;
  paymentInfo: string | null;
  maxTeamsPerRegistrant: number;
  participantType: ParticipantType;
}

export interface CreateRegistrationResult {
  registrationId: string;
  registrationIds?: string[];
  status: RegistrationStatus;
  checkoutUrl: string | null;
}

/** A player's own registration, as returned by GET /public/registrations/me. */
/** One team's record (validated scores only), or the sum of them. */
export interface PlayerTeamRecord {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  scored: number;
  conceded: number;
}

/** GET /public/registrations/me/stats: the team manager's space. */
export interface PlayerRegistrationStats {
  registrations: {
    total: number;
    confirmed: number;
    pending: number;
    waitlist: number;
    refused: number;
  };
  tournaments: number;
  totals: PlayerTeamRecord;
  teams: (PlayerTeamRecord & {
    tournament: { name: string; slug: string };
    categoryName: string;
    teamName: string;
  })[];
}

export interface PlayerRegistration {
  id: string;
  teamName: string;
  status: RegistrationStatus;
  paymentStatus?: RegistrationPaymentStatus;
  rejectionReason?: string | null;
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
  paymentStatus: RegistrationPaymentStatus;
  rejectionReason: string | null;
  amountCents: number;
  currency: string;
  teamId: string | null;
  createdAt: string;
  paidAt: string | null;
  registrant: { firstName: string; lastName: string; email: string };
  players: RegistrationPlayerInput[];
}
