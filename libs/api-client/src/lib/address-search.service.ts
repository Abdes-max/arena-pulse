import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_CLIENT_CONFIG } from './api-client.config';

/** Mirrors apps/api's geocoding AddressSuggestion. */
export interface AddressSuggestion {
  label: string;
  detail: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
}

const DEBOUNCE_MS = 300;
const MIN_CHARS = 3;

/**
 * Debounced, last-query-wins state for one search field -- feed it every
 * keystroke with `query()`, bind `suggestions()`/`loading()`/`failed()`.
 */
export class DebouncedAutocomplete<T> {
  readonly suggestions = signal<T[]>([]);
  readonly loading = signal(false);
  readonly failed = signal(false);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private latest = '';

  constructor(private readonly search: (q: string) => Promise<T[]>) {}

  query(text: string): void {
    this.latest = text.trim();
    if (this.timer) {
      clearTimeout(this.timer);
    }
    if (this.latest.length < MIN_CHARS) {
      this.clear();
      return;
    }
    const q = this.latest;
    this.timer = setTimeout(() => void this.run(q), DEBOUNCE_MS);
  }

  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.suggestions.set([]);
    this.loading.set(false);
    this.failed.set(false);
  }

  private async run(q: string): Promise<void> {
    this.loading.set(true);
    try {
      const results = await this.search(q);
      if (q === this.latest) {
        this.suggestions.set(results);
        this.failed.set(false);
      }
    } catch {
      if (q === this.latest) {
        this.suggestions.set([]);
        this.failed.set(true);
      }
    } finally {
      if (q === this.latest) {
        this.loading.set(false);
      }
    }
  }
}

export class AddressAutocomplete extends DebouncedAutocomplete<AddressSuggestion> {}

/** Venue address suggestions through the API's geocoding proxy (Photon/OSM). */
@Injectable({ providedIn: 'root' })
export class AddressSearchService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(API_CLIENT_CONFIG);

  search(q: string, lang?: string): Promise<AddressSuggestion[]> {
    let params = new HttpParams().set('q', q);
    if (lang) {
      params = params.set('lang', lang);
    }
    return firstValueFrom(
      this.http.get<AddressSuggestion[]>(`${this.config.apiUrl}/geocoding/search`, { params }),
    );
  }

  /** A fresh debounced autocomplete bound to this service. */
  autocomplete(lang?: () => string): AddressAutocomplete {
    return new AddressAutocomplete((q) => this.search(q, lang?.()));
  }
}
