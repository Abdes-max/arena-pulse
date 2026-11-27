import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  OrganizerCategory,
  OrganizerPhase,
  StructurePresetResult,
  WizardStructureFormat,
} from './models';

export interface MatchSummary {
  id: string;
  round: number;
  homeTeam: { id: string; name: string; logoUrl: string | null } | null;
  awayTeam: { id: string; name: string; logoUrl: string | null } | null;
  // field is already in the real API response (MATCH_INCLUDE, apps/api's
  // match-summary.util.ts) -- just never surfaced through this narrower
  // wizard-facing type until the Calendrier step's card needed it too.
  timeSlot: { startTime: string; field: { name: string } } | null;
}

// Plumbing behind the wizard's "Structure" and "Calendrier" steps -- these
// aren't user-facing concepts of their own in this simplified wizard (see
// models.ts's comment on WizardStructureFormat), just endpoints the wizard
// has to call in sequence to get from "a list of team names" to "a
// generated calendar": one implicit category (the tournament's only one, so
// it never surfaces in the UI -- apps/api requires a categoryId everywhere
// below it, but this wizard doesn't model multi-category tournaments), one
// implicit venue with one or more fields (from the "Lieu" the organizer typed in the Infos
// step -- apps/api's real Venue/Field entities, not a free-text field on
// Tournament itself), then the structure preset (which also assigns the
// already-created teams into pools/groups server-side) and schedule
// generation. See apps/api/src/tournaments/{categories,venues,fields,
// structure-presets,schedule}.controller.ts.
@Injectable({ providedIn: 'root' })
export class TournamentCreationService {
  private readonly http = inject(HttpClient);

  private tournamentBase(organizationId: string, tournamentId: string): string {
    return `${environment.apiUrl}/organizations/${organizationId}/tournaments/${tournamentId}`;
  }

  /** Edit-mode wizard's preload (tournament-wizard.page.ts) -- the wizard only ever creates/uses one category, so it just reads [0] off this. */
  listCategories(organizationId: string, tournamentId: string): Promise<OrganizerCategory[]> {
    return firstValueFrom(
      this.http.get<OrganizerCategory[]>(
        `${this.tournamentBase(organizationId, tournamentId)}/categories`,
      ),
    );
  }

  /** Edit-mode wizard's preload -- lets it tell whether a structure already exists (see StructurePresetsService.create's "catégorie vierge" guard, apps/api) and summarize it read-only instead of re-offering the format picker. */
  listPhases(
    organizationId: string,
    tournamentId: string,
    categoryId: string,
  ): Promise<OrganizerPhase[]> {
    return firstValueFrom(
      this.http.get<OrganizerPhase[]>(
        `${this.tournamentBase(organizationId, tournamentId)}/categories/${categoryId}/phases`,
      ),
    );
  }

  /** Edit-mode wizard's preload -- same matches shape generateSchedule() below already returns, just read back instead of generated. */
  listMatches(
    organizationId: string,
    tournamentId: string,
    phaseId: string,
  ): Promise<MatchSummary[]> {
    return firstValueFrom(
      this.http.get<MatchSummary[]>(
        `${this.tournamentBase(organizationId, tournamentId)}/phases/${phaseId}/matches`,
      ),
    );
  }

  createCategory(
    organizationId: string,
    tournamentId: string,
    name: string,
  ): Promise<OrganizerCategory> {
    return firstValueFrom(
      this.http.post<OrganizerCategory>(
        `${this.tournamentBase(organizationId, tournamentId)}/categories`,
        { name },
      ),
    );
  }

  createStructurePreset(
    organizationId: string,
    tournamentId: string,
    categoryId: string,
    options: StructurePresetOptions,
  ): Promise<StructurePresetResult> {
    return firstValueFrom(
      this.http.post<StructurePresetResult>(
        `${this.tournamentBase(organizationId, tournamentId)}/categories/${categoryId}/structure-presets`,
        buildStructurePresetPayload(options),
      ),
    );
  }

  /**
   * Makes sure the tournament has at least `count` fields and returns that
   * many field ids -- reuses the ones already there (a second "Générer" tap,
   * or the edit-mode wizard) and only creates the missing "Terrain N",
   * under the existing venue or a new one named `venueName`.
   */
  listVenues(
    organizationId: string,
    tournamentId: string,
  ): Promise<{ id: string; name: string; address: string | null }[]> {
    return firstValueFrom(
      this.http.get<{ id: string; name: string; address: string | null }[]>(
        `${this.tournamentBase(organizationId, tournamentId)}/venues`,
      ),
    );
  }

  updateVenue(
    organizationId: string,
    tournamentId: string,
    venueId: string,
    payload: { name: string; address?: string },
  ): Promise<unknown> {
    return firstValueFrom(
      this.http.patch(
        `${this.tournamentBase(organizationId, tournamentId)}/venues/${venueId}`,
        payload,
      ),
    );
  }

  async ensureFields(
    organizationId: string,
    tournamentId: string,
    venueName: string,
    count: number,
    venueAddress?: string | null,
  ): Promise<string[]> {
    const base = this.tournamentBase(organizationId, tournamentId);
    const venues = await firstValueFrom(
      this.http.get<{ id: string; fields: { id: string }[] }[]>(`${base}/venues`),
    );
    const venue =
      venues[0] ??
      (await firstValueFrom(
        this.http.post<{ id: string; fields: { id: string }[] }>(`${base}/venues`, {
          name: venueName,
          ...(venueAddress ? { address: venueAddress } : {}),
        }),
      ));
    const fieldIds = venues.flatMap((v) => v.fields.map((field) => field.id));
    for (let i = fieldIds.length; i < count; i++) {
      const field = await firstValueFrom(
        this.http.post<{ id: string }>(`${base}/venues/${venue.id}/fields`, {
          name: `Terrain ${i + 1}`,
          position: i,
        }),
      );
      fieldIds.push(field.id);
    }
    return fieldIds.slice(0, count);
  }

  /** Only meaningful on the pool/seed phase (groupPhaseId) -- knockout tier phases are scheduled round by round later, not pre-generated (see the API's own guard: "Le calendrier ne peut être généré que pour une phase de poules"). Generating again replaces a calendar nobody has played yet. */
  async generateSchedule(
    organizationId: string,
    tournamentId: string,
    phaseId: string,
    options: {
      fieldIds: string[];
      startDateTime: string;
      matchDurationMinutes?: number;
      breakDurationMinutes?: number;
    },
  ): Promise<MatchSummary[]> {
    return firstValueFrom(
      this.http.post<MatchSummary[]>(
        `${this.tournamentBase(organizationId, tournamentId)}/phases/${phaseId}/generate-schedule`,
        options,
      ),
    );
  }

  /** Moves every not-yet-played match of the phase by `minutes` (negative = earlier). */
  shiftSchedule(
    organizationId: string,
    tournamentId: string,
    phaseId: string,
    minutes: number,
  ): Promise<MatchSummary[]> {
    return firstValueFrom(
      this.http.post<MatchSummary[]>(
        `${this.tournamentBase(organizationId, tournamentId)}/phases/${phaseId}/schedule/shift`,
        { minutes },
      ),
    );
  }
}

// Maps the wizard's 3 simplified choices onto CreateStructurePresetDto's
// real shape (apps/api/src/tournaments/dto/create-structure-preset.dto.ts).
// "league" (round-robin, "tous contre tous") is POOLS_ONLY with a single
// pool -- every team lands in the same group, so the pool phase's own
// round-robin fixture generator (see the Calendrier step) already produces
// exactly a championship schedule, no separate code path needed.
/** The wizard's Structure step, as sent to structure-presets. */
export interface StructurePresetOptions {
  format: WizardStructureFormat;
  teamCount: number;
  poolCount: number;
  qualifiersPerPool: number;
  /** « Qualifier vers plusieurs compétitions »: one knockout per tier (else one « Phase finale »). */
  tiers?: { name: string; qualifiersPerPool: number }[];
  /** « Inclure les meilleurs classés à une position »: they join the first tier. */
  bestOfPosition?: { position: number; bestCount: number };
}

function buildStructurePresetPayload(options: StructurePresetOptions): Record<string, unknown> {
  const { format, teamCount, poolCount, qualifiersPerPool, tiers, bestOfPosition } = options;
  if (format === 'knockout-only') {
    return { format: 'KNOCKOUT_ONLY', teamCount };
  }
  if (format === 'league') {
    return { format: 'POOLS_ONLY', teamCount, poolCount: 1 };
  }
  return {
    format: 'POOLS_AND_KNOCKOUT',
    teamCount,
    poolCount,
    tiers: tiers?.length ? tiers : [{ name: 'Phase finale', qualifiersPerPool }],
    ...(bestOfPosition && { bestOfPosition }),
  };
}
