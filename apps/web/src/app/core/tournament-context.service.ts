import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { PublicApiService } from 'api-client';
import { TournamentEventStream } from 'realtime-client';
import { Category, PublicTournament } from 'shared-models';
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
  // Shared by the shell header (venue name + categories, shown on every
  // tab) and the "Tournoi" tab's own page -- fetched once here instead of
  // each separately, same "sibling pages share one fetch" rationale as
  // `tournament` itself (see this class's own doc comment).
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(true);
  // Holds a Transloco *key*, not the translated text -- resolved in the
  // template (`| transloco`) so it stays reactive to a language switch.
  readonly errorMessage = signal<string | null>(null);

  /**
   * Ticks whenever the SSE stream reports a match changed -- a plain trigger,
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
      const [tournament, categories] = await Promise.all([
        this.api.getTournament(slug),
        this.api.listCategories(slug),
      ]);
      this.tournament.set(tournament);
      this.categories.set(categories);
      this.stream.connect(`${environment.apiUrl}/public/tournaments/${slug}/events`);
    } catch {
      this.tournament.set(null);
      this.categories.set([]);
      this.errorMessage.set('shell.error.notFound');
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.stream.close();
  }
}
