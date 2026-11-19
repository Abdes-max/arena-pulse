import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_CLIENT_CONFIG } from './api-client.config';
import { DebouncedAutocomplete } from './address-search.service';

/** Mirrors apps/api's club-directory ClubSuggestion. */
export interface ClubSuggestion {
  /**
   * "fff": FFF directory; "club": other sports' directory (SportCorico);
   * "siren": State company register (no crest).
   */
  source: 'fff' | 'club' | 'siren';
  /**
   * Saved as Team.externalClubId / Tournament.organizerClubId, e.g.
   * "fff:553079" or "club:handball:allauch-handball".
   */
  externalId: string;
  name: string;
  city: string | null;
  postalCode: string | null;
  /** Department code ("13"), when the city isn't known. */
  department: string | null;
  /** API-relative crest path (resolve with AssetUrlService), when the club has one. */
  logoUrl: string | null;
}

// Sport.name (as seeded) -> the API's club directory key.
const CLUB_DIRECTORY_SPORTS: Record<string, string> = {
  Football: 'football',
  Futsal: 'football',
  Basketball: 'basketball',
  Handball: 'handball',
  Rugby: 'rugby',
  Volleyball: 'volleyball',
  Tennis: 'tennis',
};

/** The club directory to search for a sport, or null when it has none. */
export function clubDirectorySport(sportName: string | null | undefined): string | null {
  return CLUB_DIRECTORY_SPORTS[sportName ?? ''] ?? null;
}

/** Club suggestions through the API's club-directory proxy. */
@Injectable({ providedIn: 'root' })
export class ClubSearchService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CLIENT_CONFIG);

  search(q: string, sport = 'football'): Promise<ClubSuggestion[]> {
    return firstValueFrom(
      this.http.get<ClubSuggestion[]>(`${this.config.apiUrl}/club-directory/search`, {
        params: new HttpParams().set('q', q).set('sport', sport),
      }),
    );
  }

  /**
   * A fresh debounced autocomplete bound to this service; `sport` is read
   * on every search, so it follows a sport change in the form.
   */
  autocomplete(sport: () => string = () => 'football'): DebouncedAutocomplete<ClubSuggestion> {
    return new DebouncedAutocomplete((q) => this.search(q, sport()));
  }
}
