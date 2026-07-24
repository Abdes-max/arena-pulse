export type OrganizationRole = 'ORG_ADMIN' | 'ORG_MEMBER';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  role: OrganizationRole;
}

export interface MeResponse extends User {
  organizations: OrganizationSummary[];
}

export interface OrganizationMember {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: OrganizationRole;
  joinedAt: string;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: OrganizationRole;
  status: string;
  expiresAt: string;
}

export interface InvitationLookup {
  organizationName: string;
  email: string;
  role: OrganizationRole;
  requiresNewAccount: boolean;
}

export interface Sport {
  id: string;
  name: string;
}

export interface Permission {
  id: string;
  key: string;
  label: string;
}

export type TournamentStatus = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'ARCHIVED';

export interface Tournament {
  id: string;
  name: string;
  status: TournamentStatus;
  sportId: string;
  sportName: string;
  startDate: string | null;
  endDate: string | null;
  isOnline: boolean;
  createdAt: string;
}

export interface TournamentDetail extends Tournament {
  organizationId: string;
  archivedAt: string | null;
  updatedAt: string;
  teamsCanReferee: boolean;
}

export interface Division {
  id: string;
  name: string;
  colorHex: string | null;
  position: number;
}

export interface Category {
  id: string;
  name: string;
  position: number;
  divisions: Division[];
}

export interface TournamentAdministrator {
  id: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  permissionKeys: string[];
}

export interface Team {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  divisionId: string | null;
  divisionName: string | null;
  groupId: string | null;
  groupName: string | null;
  managerName: string | null;
  managerEmail: string | null;
  managerPhone: string | null;
  position: number;
}

export interface TeamImportError {
  line: number;
  message: string;
}

export interface TeamImportResult {
  created: Team[];
  errors: TeamImportError[];
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  isCaptain: boolean;
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

export interface Referee {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
}

export interface TimeSlot {
  id: string;
  fieldId: string;
  startTime: string;
  endTime: string;
  label: string | null;
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
  matchDurationMinutes: number;
  breakDurationMinutes: number;
  refereesPerMatch: number;
  groups: CompetitionGroup[];
  knockoutBracket: KnockoutBracket | null;
}

export interface StandingRule {
  groupId: string;
  winPoints: number;
  drawPoints: number;
  lossPoints: number;
  tieBreakOrder: string[];
  supplementaryStandingEnabled: boolean;
  penaltyShootoutEnabled: boolean;
}

export interface QualificationRule {
  id: string;
  groupId: string;
  fromPosition: number;
  toPosition: number;
  targetPhaseId: string;
  targetPhaseName: string;
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
  groupId: string;
  round: number;
  status: MatchStatus;
  homeTeam: { id: string; name: string } | null;
  awayTeam: { id: string; name: string } | null;
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
