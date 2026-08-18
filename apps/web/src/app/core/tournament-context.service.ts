import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { PublicApiService } from 'api-client';
import { TournamentEventStream } from 'realtime-client';
import { PublicTournament } from 'shared-models';
import { environment } from '../../environments/environment';

/**
 * Provided per TournamentShell instance (not root) so each visited tournament
 * gets its own state, but sibling pages under the same :slug share one fetch.
 */
@Injectable()
export class TournamentContextService implements OnDestroy {
  private readonly api = inject(PublicApiService);
  private readonly stream = new TournamentEventStream();

  readonly slug = signal('');
  readonly tournament = signal<PublicTournament | null>(null);
  readonly loading = signal(true);
  // Holds a Transloco *key*, not the translated text -- resolved in the
  // template (`| transloco`) so it stays reactive to a language switch.
  readonly errorMessage = signal<string | null>(null);

  /**
   * Ticks whenever the SSE stream reports a match changed — a plain trigger,
   * not the match payload itself, so pages just re-run whatever fetch they
   * already have (docs/architecture/realtime-strategy.md).
   */
  readonly lastMatchEvent = this.stream.lastEvent;

  async load(slug: string): Promise<void> {
    if (this.slug() === slug && this.tournament()) {
      return;
    }
    this.slug.set(slug);
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.tournament.set(await this.api.getTournament(slug));
      this.stream.connect(`${environment.apiUrl}/public/tournaments/${slug}/events`);
    } catch {
      this.tournament.set(null);
      this.errorMessage.set('shell.error.notFound');
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.stream.close();
  }
}
