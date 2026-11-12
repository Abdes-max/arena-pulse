import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { CompetitionPhase, Match, Venue } from 'shared-models';
import { environment } from '../../../environments/environment';

export interface ScheduleSlot {
  id: string;
  fieldId: string;
  startTime: string;
  endTime: string;
  label: string | null;
}

/** The wizard's Calendrier step: fields, their slots, the matches in them, drag & drop. */
@Injectable({ providedIn: 'root' })
export class OrganizerScheduleService {
  private readonly http = inject(HttpClient);

  private base(organizationId: string, tournamentId: string): string {
    return `${environment.apiUrl}/organizations/${organizationId}/tournaments/${tournamentId}`;
  }

  listVenues(organizationId: string, tournamentId: string): Promise<Venue[]> {
    return firstValueFrom(
      this.http.get<Venue[]>(`${this.base(organizationId, tournamentId)}/venues`),
    );
  }

  listPhases(
    organizationId: string,
    tournamentId: string,
    categoryId: string,
  ): Promise<CompetitionPhase[]> {
    return firstValueFrom(
      this.http.get<CompetitionPhase[]>(
        `${this.base(organizationId, tournamentId)}/categories/${categoryId}/phases`,
      ),
    );
  }

  listSlots(
    organizationId: string,
    tournamentId: string,
    fieldId: string,
  ): Promise<ScheduleSlot[]> {
    return firstValueFrom(
      this.http.get<ScheduleSlot[]>(
        `${this.base(organizationId, tournamentId)}/fields/${fieldId}/timeslots`,
      ),
    );
  }

  createSlot(
    organizationId: string,
    tournamentId: string,
    fieldId: string,
    payload: { startTime: string; endTime: string; label?: string },
  ): Promise<ScheduleSlot> {
    return firstValueFrom(
      this.http.post<ScheduleSlot>(
        `${this.base(organizationId, tournamentId)}/fields/${fieldId}/timeslots`,
        payload,
      ),
    );
  }

  deleteSlot(organizationId: string, tournamentId: string, slotId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base(organizationId, tournamentId)}/timeslots/${slotId}`),
    );
  }

  listMatches(organizationId: string, tournamentId: string, phaseId: string): Promise<Match[]> {
    return firstValueFrom(
      this.http.get<Match[]>(
        `${this.base(organizationId, tournamentId)}/phases/${phaseId}/matches`,
      ),
    );
  }

  /** Same endpoint as the web: the slot (or match) lands at `index`, the following slots shift. */
  move(
    organizationId: string,
    tournamentId: string,
    payload: { timeSlotId?: string; matchId?: string; fieldId: string; index: number },
  ): Promise<void> {
    return firstValueFrom(
      this.http.post<void>(`${this.base(organizationId, tournamentId)}/schedule/move`, payload),
    );
  }
}
