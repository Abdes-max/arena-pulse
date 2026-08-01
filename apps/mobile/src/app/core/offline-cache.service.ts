import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';

interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

const PREFIX = 'arena-pulse:cache:';

/**
 * Last-known-data cache for the app's "mode dégradé hors connexion"
 * (docs/design/mobile-guidelines.md): not full offline-first sync, just
 * enough to show something useful -- with an explicit "dernières données
 * du [heure]" indicator -- when a fetch fails instead of blanking the
 * screen, while a manual retry stays available.
 */
@Injectable({ providedIn: 'root' })
export class OfflineCacheService {
  get<T>(key: string): CacheEntry<T> | null {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? (JSON.parse(raw) as CacheEntry<T>) : null;
    } catch {
      return null;
    }
  }

  set<T>(key: string, data: T): void {
    try {
      const entry: CacheEntry<T> = { data, cachedAt: Date.now() };
      localStorage.setItem(PREFIX + key, JSON.stringify(entry));
    } catch {
      // Storage unavailable (private browsing, quota) -- just skip caching.
    }
  }

  /**
   * True only for a genuinely unreachable network (status 0) -- a real HTTP
   * error (404, 500...) should still surface normally rather than be masked
   * by stale cached data.
   */
  isNetworkFailure(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === 0;
  }

  formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
}
