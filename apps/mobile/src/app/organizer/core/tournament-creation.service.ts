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
  homeTeam: { id: string; name: string } | null;
  awayTeam: { id: string; name: string } | null;
  timeSlot: { startTime: string } | null;
}

// Plumbing behind the wizard's "Structure" and "Calendrier" steps -- these
// aren't user-facing concepts of their own in this simplified wizard (see
// models.ts's comment on WizardStructureFormat), just endpoints the wizard
// has to call in sequence to get from "a list of team names" to "a
// generated calendar": one implicit category (the tournament's only one, so
// it never surfaces in the UI -- apps/api requires a categoryId everywhere
// below it, but this wizard doesn't model multi-category tournaments), one
// implicit venue+field (from the "Lieu" the organizer typed in the Infos
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

  /** Creates one venue with one field under it, returning just the field's id -- the only thing generateSchedule() needs. */
  async createDefaultVenueField(
    organizationId: string,
    tournamentId: string,
    venueName: string,
  ): Promise<string> {
    const venue = await firstValueFrom(
      this.http.post<{ id: string }>(
        `${this.tournamentBase(organizationId, tournamentId)}/venues`,
        { name: venueName },
      ),
    );
    const field = await firstValueFrom(
      this.http.post<{ id: string }>(
        `${this.tournamentBase(organizationId, tournamentId)}/venues/${venue.id}/fields`,
        { name: 'Terrain 1' },
      ),
    );
    return field.id;
  }

  createStructurePreset(
    organizationId: string,
    tournamentId: string,
    categoryId: string,
    options: {
      format: WizardStructureFormat;
      teamCount: number;
      poolCount: number;
      qualifiersPerPool: number;
    },
  ): Promise<StructurePresetResult> {
    return firstValueFrom(
      this.http.post<StructurePresetResult>(
        `${this.tournamentBase(organizationId, tournamentId)}/categories/${categoryId}/structure-presets`,
        buildStructurePresetPayload(options),
      ),
    );
  }

  /** Only meaningful on the pool/seed phase (groupPhaseId) -- knockout tier phases are scheduled round by round later, not pre-generated (see the API's own guard: "Le calendrier ne peut être généré que pour une phase de poules"). */
  async generateSchedule(
    organizationId: string,
    tournamentId: string,
    phaseId: string,
    fieldId: string,
    startDateTime: string,
  ): Promise<MatchSummary[]> {
    return firstValueFrom(
      this.http.post<MatchSummary[]>(
        `${this.tournamentBase(organizationId, tournamentId)}/phases/${phaseId}/generate-schedule`,
        { fieldIds: [fieldId], startDateTime },
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
function buildStructurePresetPayload(options: {
  format: WizardStructureFormat;
  teamCount: number;
  poolCount: number;
  qualifiersPerPool: number;
}): Record<string, unknown> {
  const { format, teamCount, poolCount, qualifiersPerPool } = options;
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
    tiers: [{ name: 'Phase finale', qualifiersPerPool }],
  };
}
