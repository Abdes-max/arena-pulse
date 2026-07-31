import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { PublicApiService } from './public-api.service';
import { PublicTournament } from './models';

const EVENT_DEBOUNCE_MS = 300;

/**
 * Provided per TournamentShell instance (not root) so each visited tournament
 * gets its own state, but sibling pages under the same :slug share one fetch.
 */
@Injectable()
export class TournamentContextService implements OnDestroy {
  private readonly api = inject(PublicApiService);

  readonly slug = signal('');
  readonly tournament = signal<PublicTournament | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  /**
   * Ticks whenever the SSE stream reports a match changed — a plain trigger,
   * not the match payload itself, so pages just re-run whatever fetch they
   * already have (docs/architecture/realtime-strategy.md).
   */
  readonly lastMatchEvent = signal<{ matchId: string } | null>(null);

  private eventSource: EventSource | null = null;
  private debounceHandle: ReturnType<typeof setTimeout> | null = null;

  async load(slug: string): Promise<void> {
    if (this.slug() === slug && this.tournament()) {
      return;
    }
    this.slug.set(slug);
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.tournament.set(await this.api.getTournament(slug));
      this.connectRealtime(slug);
    } catch {
      this.tournament.set(null);
      this.errorMessage.set("Ce tournoi n'existe pas ou n'est pas publié.");
    } finally {
      this.loading.set(false);
    }
  }

  private connectRealtime(slug: string): void {
    this.eventSource?.close();
    this.eventSource = new EventSource(`${environment.apiUrl}/public/tournaments/${slug}/events`);
    this.eventSource.onmessage = (message: MessageEvent<string>) => {
      const payload = JSON.parse(message.data) as { matchId: string };
      if (this.debounceHandle) {
        clearTimeout(this.debounceHandle);
      }
      this.debounceHandle = setTimeout(() => {
        this.lastMatchEvent.set({ matchId: payload.matchId });
      }, EVENT_DEBOUNCE_MS);
    };
  }

  ngOnDestroy(): void {
    this.eventSource?.close();
    if (this.debounceHandle) {
      clearTimeout(this.debounceHandle);
    }
  }
}
