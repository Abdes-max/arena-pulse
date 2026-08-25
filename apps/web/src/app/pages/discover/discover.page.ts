import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AssetUrlService, PublicApiService } from 'api-client';
import { LanguageSwitcher, Logo, Select, TextField, TournamentCard } from 'design-system';
import { LanguageCode, LanguageService, SUPPORTED_LANGUAGES } from 'design-tokens';
import { debounceTime } from 'rxjs';
import { PublicSport, PublicTournamentDirectoryItem } from 'shared-models';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-discover-page',
  imports: [RouterLink, LanguageSwitcher, Logo, TextField, Select, TournamentCard, TranslocoPipe],
  templateUrl: './discover.page.html',
  styleUrl: './discover.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DiscoverPage {
  private readonly location = inject(Location);
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  private readonly api = inject(PublicApiService);
  private readonly assetUrl = inject(AssetUrlService);

  protected readonly language = this.languageService.language;
  protected readonly languages = SUPPORTED_LANGUAGES;

  protected readonly q = signal('');
  protected readonly sportId = signal('');
  protected readonly place = signal('');
  protected readonly dateFrom = signal('');
  protected readonly sports = signal<PublicSport[]>([]);
  protected readonly sportOptions = computed(() => {
    const lang = this.language();
    return [
      { value: '', label: this.transloco.translate('discover.filters.allSports', {}, lang) },
      ...this.sports().map((sport) => ({ value: sport.id, label: sport.name })),
    ];
  });

  protected readonly items = signal<PublicTournamentDirectoryItem[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(false);
  protected readonly hasSearched = signal(false);
  protected readonly hasMore = computed(() => this.items().length < this.total());

  // The card's [organizerName] wants plain text and [logoUrl] wants an
  // already-resolved (absolute) URL -- same "dumb presenter" reasoning as
  // landing.page.ts's own logoUrl()/marqueeTournaments, applied per-item
  // here instead since this list doesn't get its own dedicated computed.
  protected readonly resolvedItems = computed(() =>
    this.items().map((item) => ({ ...item, logoUrl: this.assetUrl.resolve(item.logoUrl) })),
  );

  // page is plain component state, not a signal -- it never drives its own
  // template binding (only loadMore()/the filters effect below read or
  // write it), so there's nothing for reactivity to buy here.
  private page = 1;

  private readonly filters = computed(() => ({
    q: this.q().trim(),
    sportId: this.sportId(),
    location: this.place().trim(),
    dateFrom: this.dateFrom(),
  }));

  constructor() {
    void this.api.listSports().then((sports) => this.sports.set(sports));

    // Every filter change re-runs the search from page 1 -- debounced so
    // typing in the name/location fields doesn't fire a request per
    // keystroke (first use of this pattern in the repo: no other page here
    // does a server-side, as-you-type search, see the PR description).
    toObservable(this.filters)
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe((filters) => {
        this.page = 1;
        void this.runSearch(filters, false);
      });
  }

  protected goBack(): void {
    this.location.back();
  }

  protected onLanguageChange(code: string): void {
    this.languageService.setLanguage(code as LanguageCode);
  }

  protected loadMore(): void {
    this.page += 1;
    void this.runSearch(this.filters(), true);
  }

  private async runSearch(
    filters: { q: string; sportId: string; location: string; dateFrom: string },
    append: boolean,
  ): Promise<void> {
    this.loading.set(true);
    try {
      const result = await this.api.searchTournaments({
        q: filters.q || undefined,
        sportId: filters.sportId || undefined,
        location: filters.location || undefined,
        dateFrom: filters.dateFrom || undefined,
        page: this.page,
        pageSize: PAGE_SIZE,
      });
      this.items.set(append ? [...this.items(), ...result.items] : result.items);
      this.total.set(result.total);
      this.hasSearched.set(true);
    } finally {
      this.loading.set(false);
    }
  }
}
