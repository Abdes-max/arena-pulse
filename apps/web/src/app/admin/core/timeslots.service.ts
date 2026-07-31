import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TimeSlot } from './models';

export interface CreateTimeSlotPayload {
  startTime: string;
  endTime: string;
  label?: string;
}

@Injectable({ providedIn: 'root' })
export class TimeSlotsService {
  private readonly http = inject(HttpClient);

  private base(organizationId: string, tournamentId: string): string {
    return `${environment.apiUrl}/organizations/${organizationId}/tournaments/${tournamentId}`;
  }

  listTimeSlots(
    organizationId: string,
    tournamentId: string,
    fieldId: string,
  ): Promise<TimeSlot[]> {
    return firstValueFrom(
      this.http.get<TimeSlot[]>(
        `${this.base(organizationId, tournamentId)}/fields/${fieldId}/timeslots`,
      ),
    );
  }

  createTimeSlot(
    organizationId: string,
    tournamentId: string,
    fieldId: string,
    payload: CreateTimeSlotPayload,
  ): Promise<TimeSlot> {
    return firstValueFrom(
      this.http.post<TimeSlot>(
        `${this.base(organizationId, tournamentId)}/fields/${fieldId}/timeslots`,
        payload,
      ),
    );
  }

  deleteTimeSlot(organizationId: string, tournamentId: string, timeSlotId: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.base(organizationId, tournamentId)}/timeslots/${timeSlotId}`),
    );
  }
}
