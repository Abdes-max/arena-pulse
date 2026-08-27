import {
  CompetitionGroup,
  CompetitionPhaseType,
  KnockoutBracket,
  PublicTheme,
  TournamentStatus,
} from 'shared-models';

export * from 'shared-models';

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

// Alternative to paying per tournament publication (feat/044) -- one active
// subscription per organization covers every publication for a year. See
// docs/architecture/adr/0006-paid-tournament-publication.md.
export interface OrganizationSubscriptionNone {
  status: 'NONE';
}

export interface OrganizationSubscriptionPending {
  status: 'PENDING_PAYMENT';
  amountCents: number;
  currency: string;
}

export interface OrganizationSubscriptionActive {
  status: 'ACTIVE';
  startsAt: string;
  expiresAt: string;
}

export type OrganizationSubscriptionStatus =
  OrganizationSubscriptionNone | OrganizationSubscriptionPending | OrganizationSubscriptionActive;

// Same shape as PublishPendingPayment (tournaments.service.ts) -- returned
// when subscribing requires a Stripe payment first.
export interface SubscribePendingPayment {
  status: 'PENDING_PAYMENT';
  checkoutUrl: string;
}

export type SubscribeResult = OrganizationSubscriptionActive | SubscribePendingPayment;

// Full payment history for the organization's subscription, most recent
// first -- distinct from OrganizationSubscriptionStatus above, which only
// reports the single current row.
export interface SubscriptionHistoryEntry {
  id: string;
  status: 'PENDING_PAYMENT' | 'ACTIVE';
  amountCents: number;
  currency: string;
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  paidAt: string | null;
}

// One TournamentPublicationOrder row -- usually a single PAID entry, but an
// abandoned checkout can leave a PENDING_PAYMENT one alongside it.
export interface PublicationOrder {
  id: string;
  status: 'PENDING_PAYMENT' | 'PAID';
  categoriesCount: number;
  teamsCount: number;
  amountCents: number;
  currency: string;
  createdAt: string;
  paidAt: string | null;
  // Stripe's own hosted receipt -- null for a $0 free-tier order (never
  // goes through Stripe Checkout) or a still-PENDING_PAYMENT one.
  stripeReceiptUrl: string | null;
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

export interface Tournament {
  id: string;
  name: string;
  slug: string;
  status: TournamentStatus;
  sportId: string;
  sportName: string;
  startDate: string | null;
  endDate: string | null;
  isOnline: boolean;
  theme: PublicTheme;
  logoUrl: string | null;
  createdAt: string;
}

export interface TournamentDetail extends Tournament {
  organizationId: string;
  archivedAt: string | null;
  updatedAt: string;
  teamsCanReferee: boolean;
  isListed: boolean;
  description: string | null;
  rules: string | null;
  practicalInfo: string | null;
}

export interface Sponsor {
  id: string;
  name: string;
  logoUrl: string | null;
  linkUrl: string | null;
  position: number;
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
  registrationFeeCents: number | null;
  registrationFeeCurrency: string | null;
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
  logoUrl: string | null;
  position: number;
}

export interface TeamImportError {
  line: number;
  message: string;
}

export interface TeamImportResult {
  created: Team[];
  errors: TeamImportError[];
  // Non-fatal issues that didn't stop a row's team from being created --
  // today only an unreachable/unrecognized `logo` column value.
  warnings: TeamImportError[];
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber: number | null;
  isCaptain: boolean;
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

export interface CompetitionPhase {
  id: string;
  name: string;
  type: CompetitionPhaseType;
  position: number;
  matchDurationMinutes: number;
  breakDurationMinutes: number;
  refereesPerMatch: number;
  // GROUP_STAGE only -- always false for KNOCKOUT (two-legged elimination ties are not supported).
  doubleRoundRobin: boolean;
  // True only for the fictitious pool phase a KNOCKOUT_ONLY structure preset
  // creates to seed its bracket from -- no match is ever generated in it, so
  // Structure/Calendrier hide it from their phase lists instead of showing
  // an empty, unusable pool.
  isSeedPhase: boolean;
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

// Compares the team at `position` across every pool of `phaseId` (e.g. every
// 3rd place) and qualifies the `bestCount` best of them -- distinct from
// QualificationRule, which only ranges over one pool's own positions.
export interface CrossGroupQualificationRule {
  id: string;
  phaseId: string;
  position: number;
  bestCount: number;
  targetPhaseId: string;
  targetPhaseName: string;
}
