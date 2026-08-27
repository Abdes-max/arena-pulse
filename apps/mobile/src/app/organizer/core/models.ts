// TournamentStatus/PublicTheme come from shared-models (not duplicated
// below): the same enum values already cross the public/organizer boundary
// via the public tournament directory + PublicApiService, unlike
// OrganizationRole/OrganizerUser/MeResponse below, which are genuinely
// organizer-only shapes mirroring apps/web/src/app/admin/core/models.ts --
// deliberately duplicated rather than shared, same convention as that
// file's own top comment: this is an admin/organizer-app concern, not a
// public one, so it doesn't belong in shared-models alongside the
// public-site types both apps already share.
import type { PublicTheme, TournamentStatus } from 'shared-models';

export type { PublicTheme, TournamentStatus };

export type OrganizationRole = 'ORG_ADMIN' | 'ORG_MEMBER';

export interface OrganizerUser {
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

export interface MeResponse extends OrganizerUser {
  organizations: OrganizationSummary[];
}

export interface OrganizerTournament {
  id: string;
  name: string;
  slug: string;
  status: TournamentStatus;
  sportId: string;
  sportName: string;
  isOnline: boolean;
  isListed: boolean;
  theme: PublicTheme;
  logoUrl: string | null;
  createdAt: string;
}

export interface CreateTournamentPayload {
  name: string;
  sportId: string;
  isOnline?: boolean;
  isListed?: boolean;
  theme?: PublicTheme;
}

// Publishing may require a Stripe payment first once past the free tier
// (see PremiumFeaturesStatus below) -- mirrors
// apps/web/src/app/admin/core/tournaments.service.ts's own
// PublishTournamentResult, same /publish + /publish/confirm endpoints.
export interface PublishPendingPayment {
  status: 'PENDING_PAYMENT';
  checkoutUrl: string;
}

export type PublishTournamentResult = OrganizerTournament | PublishPendingPayment;

export interface PremiumFeaturesStatus {
  unlocked: boolean;
  freeMaxTeams: number;
}

export interface OrganizerTeam {
  id: string;
  name: string;
  categoryId: string;
}

export interface OrganizerCategory {
  id: string;
  name: string;
}

// The 3 formats the creation wizard's "Structure" step offers -- a
// deliberately narrowed subset of what CreateStructurePresetDto actually
// supports server-side (multi-tier brackets, best-of-position qualifiers,
// custom match/break durations...): this wizard is a fast "get started"
// path, not the full structure editor. "league" (round-robin) is just
// POOLS_ONLY with a single pool under the hood -- see
// tournament-creation.service.ts's buildStructurePresetPayload().
export type WizardStructureFormat = 'pools-knockout' | 'knockout-only' | 'league';

export interface StructurePresetResult {
  groupPhaseId: string;
  tiers: { phaseId: string; name: string; bracketSize: number }[];
}
