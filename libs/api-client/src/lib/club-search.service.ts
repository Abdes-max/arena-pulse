import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_CLIENT_CONFIG } from './api-client.config';
import { DebouncedAutocomplete } from './address-search.service';

/** Mirrors apps/api's club-directory ClubSuggestion. */
export interface ClubSuggestion {
  /** "fff": FFF directory (with crest); "siren": State company register. */
  source: 'fff' | 'siren';
  /** Saved as Team.externalClubId, e.g. "fff:553079". */
  externalId: string;
  name: string;
  city: string | null;
  postalCode: string | null;
  /** Department code ("13"), when the city isn't known. */
  department: string | null;
  /** API-relative crest path (resolve with AssetUrlService), FFF clubs only. */
  logoUrl: string | null;
}

/** Football club suggestions through the API's club-directory proxy. */
@Injectable({ providedIn: 'root' })
export class ClubSearchService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CLIENT_CONFIG);

  search(q: string): Promise<ClubSuggestion[]> {
    return firstValueFrom(
      this.http.get<ClubSuggestion[]>(`${this.config.apiUrl}/club-directory/search`, {
        params: new HttpParams().set('q', q),
      }),
    );
  }

  /** A fresh debounced autocomplete bound to this service. */
  autocomplete(): DebouncedAutocomplete<ClubSuggestion> {
    return new DebouncedAutocomplete((q) => this.search(q));
  }
}
