import { Injectable, inject, signal } from '@angular/core';
import { PublicApiService } from './public-api.service';
import { PublicTournament } from './models';

/**
 * Provided per TournamentShell instance (not root) so each visited tournament
 * gets its own state, but sibling pages under the same :slug share one fetch.
 */
@Injectable()
export class TournamentContextService {
  private readonly api = inject(PublicApiService);

  readonly slug = signal('');
  readonly tournament = signal<PublicTournament | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  async load(slug: string): Promise<void> {
    if (this.slug() === slug && this.tournament()) {
      return;
    }
    this.slug.set(slug);
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.tournament.set(await this.api.getTournament(slug));
    } catch {
      this.tournament.set(null);
      this.errorMessage.set("Ce tournoi n'existe pas ou n'est pas publié.");
    } finally {
      this.loading.set(false);
    }
  }
}
