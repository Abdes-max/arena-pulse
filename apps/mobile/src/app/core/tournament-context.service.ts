import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { PublicApiService } from 'api-client';
import { TournamentEventStream } from 'realtime-client';
import { PublicTournament } from 'shared-models';
import { environment } from '../../environments/environment';
import { OfflineCacheService } from './offline-cache.service';

/**
 * Provided per TournamentShell instance (not root) so each visited tournament
 * gets its own state, but sibling pages under the same :slug share one fetch.
 */
@Injectable()
export class TournamentContextService implements OnDestroy {
  private readonly api = inject(PublicApiService);
  private readonly cache = inject(OfflineCacheService);
  private readonly stream = new TournamentEventStream();

  readonly slug = signal('');
  readonly tournament = signal<PublicTournament | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  /** Set when `tournament` is last-known cached data rather than a fresh fetch -- see OfflineCacheService. */
  readonly cachedAt = signal<number | null>(null);

  /**
   * Ticks whenever the SSE stream reports a match changed — a plain trigger,
   * not the match payload itself, so pages just re-run whatever fetch they
   * already have (docs/architecture/realtime-strategy.md).
   */
  readonly lastMatchEvent = this.stream.lastEvent;

  async load(slug: string): Promise<void> {
    if (this.slug() === slug && this.tournament() && this.cachedAt() === null) {
      return;
    }
    this.slug.set(slug);
    this.loading.set(true);
    this.errorMessage.set(null);
    const cacheKey = `tournament:${slug}`;
    try {
      const tournament = await this.api.getTournament(slug);
      this.tournament.set(tournament);
      this.cachedAt.set(null);
      this.cache.set(cacheKey, tournament);
      this.stream.connect(`${environment.apiUrl}/public/tournaments/${slug}/events`);
    } catch (error) {
      const cached = this.cache.get<PublicTournament>(cacheKey);
      if (this.cache.isNetworkFailure(error) && cached) {
        this.tournament.set(cached.data);
        this.cachedAt.set(cached.cachedAt);
      } else {
        this.tournament.set(null);
        this.errorMessage.set("Ce tournoi n'existe pas ou n'est pas publié.");
      }
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.stream.close();
  }
}
