import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { IonContent, IonHeader, IonToolbar } from '@ionic/angular/standalone';
import { AssetUrlService, PublicApiService } from 'api-client';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  Button,
  LanguageSwitcher,
  Logo,
  Select,
  ShareButton,
  TextField,
  ThemeModeToggle,
  TournamentCard,
  TournamentMarquee,
} from 'design-system';
import {
  LanguageCode,
  LanguageService,
  SUPPORTED_LANGUAGES,
  ThemeMode,
  ThemeService,
} from 'design-tokens';
import { debounceTime } from 'rxjs';
import { PublicSport, PublicTournamentDirectoryItem, PublicTournamentSummary } from 'shared-models';
import { environment } from '../../../environments/environment';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-tournament-entry-page',
  imports: [
    Button,
    IonContent,
    IonHeader,
    IonToolbar,
    LanguageSwitcher,
    Logo,
    RouterLink,
    Select,
    ShareButton,
    TextField,
    ThemeModeToggle,
    TournamentCard,
    TournamentMarquee,
    TranslocoPipe,
  ],
  templateUrl: './tournament-entry.page.html',
  styleUrl: './tournament-entry.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentEntryPage {
  private readonly router = inject(Router);
  private readonly api = inject(PublicApiService);
  private readonly themeService = inject(ThemeService);
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  private readonly assetUrl = inject(AssetUrlService);

  // Still the plain "recent 50 published" fetch -- feeds the hero's
  // marquee/example-tournament CTA only. The "Événements publiés" section
  // below is now driven by its own server search (see q/sportId/place/
  // dateFrom/items/searchResolvedItems below), not this list.
  protected readonly tournaments = signal<PublicTournamentSummary[]>([]);
  // Governs everything below the hero, same as apps/web's landing.page --
  // the hero itself stays forced dark regardless (data-mode="dark" scoped
  // on tournament-entry-page__hero in the template).
  protected readonly mode = this.themeService.mode;
  protected readonly language = this.languageService.language;
  protected readonly languages = SUPPORTED_LANGUAGES;

  // Connexion/Créer un tournoi now navigate natively (feat/193, see
  // organizerAuthGuard's routes) instead of handing off to the web app --
  // only the remaining rows below (contact/pricing/legal) still do. Kept in
  // the Paramètres panel (grouped with the rest of this section) rather than
  // moved back into the toolbar, same layout reasoning as before.
  protected readonly contactUrl = `${environment.webUrl}/contact`;
  protected readonly pricingUrl = `${environment.webUrl}/#tarifs`;
  protected readonly privacyUrl = `${environment.webUrl}/privacy`;
  protected readonly termsUrl = `${environment.webUrl}/terms`;
  protected readonly appUrl = environment.webUrl;
  protected readonly exampleTournament = computed(() => this.tournaments()[0] ?? null);
  // Governs the hero's own CTA: this screen's H1 promises "Suivre une
  // compétition", so its primary action should deliver on that (jump to
  // the published-events list already on this same page) rather than
  // "Créer un tournoi" -- an organizer action, and one this app can't even
  // complete itself. That link still lives in the nav next to Connexion,
  // just no longer competing for the hero's single most prominent button.
  protected readonly hasTournaments = computed(() => this.tournaments().length > 0);
  // Whether the hero (title/hint/CTAs/marquee) is shown, or collapsed down
  // to just a back arrow -- toggled by "Voir les événements" so the
  // published list gets the whole screen instead of sharing it below the
  // fold, and the dark hero doesn't stay competing for attention once its
  // job (getting the visitor to the list) is done.
  protected readonly showHero = signal(true);
  protected readonly showSettings = signal(false);
  // Lets the whole "Partager l'app" row act as the tap target (matching
  // every other row) instead of just the small ap-share-button icon inside
  // it: the row's own (click) is disabled with pointer-events: none on the
  // button (see the template/scss), and proxies the tap to the button's own
  // triggerShare() -- reuses its timeout/clipboard-fallback/failure-state
  // logic rather than duplicating it.
  private readonly shareButton = viewChild<ShareButton>('shareButton');

  // ap-tournament-marquee's TournamentMarqueeItem needs a resolved (absolute)
  // logoUrl -- it's a dumb presenter, same reason ap-tournament-card gets
  // its own [logoUrl]="logoUrl(t.logoUrl)" binding per-card below instead.
  protected readonly marqueeTournaments = computed(() =>
    this.tournaments().map((t) => ({ ...t, logoUrl: this.logoUrl(t.logoUrl) })),
  );

  // --- "Événements publiés" section: server-side directory search (mirrors
  // apps/web's discover.page, same debounce/filters/load-more logic) ---
  protected readonly q = signal('');
  protected readonly sportId = signal('');
  protected readonly place = signal('');
  protected readonly dateFrom = signal('');
  protected readonly sports = signal<PublicSport[]>([]);
  protected readonly sportOptions = computed(() => {
    const lang = this.language();
    return [
      {
        value: '',
        label: this.transloco.translate('tournamentEntry.published.filters.allSports', {}, lang),
      },
      ...this.sports().map((sport) => ({ value: sport.id, label: sport.name })),
    ];
  });

  protected readonly searchItems = signal<PublicTournamentDirectoryItem[]>([]);
  protected readonly searchTotal = signal(0);
  protected readonly searchLoading = signal(false);
  protected readonly hasSearched = signal(false);
  protected readonly hasMoreResults = computed(
    () => this.searchItems().length < this.searchTotal(),
  );
  protected readonly resolvedSearchItems = computed(() =>
    this.searchItems().map((item) => ({ ...item, logoUrl: this.logoUrl(item.logoUrl) })),
  );

  private searchPage = 1;
  private readonly searchFilters = computed(() => ({
    q: this.q().trim(),
    sportId: this.sportId(),
    location: this.place().trim(),
    dateFrom: this.dateFrom(),
  }));

  constructor() {
    void this.api.listTournaments(50).then((tournaments) => this.tournaments.set(tournaments));
    void this.api.listSports().then((sports) => this.sports.set(sports));

    toObservable(this.searchFilters)
      .pipe(debounceTime(300), takeUntilDestroyed())
      .subscribe((filters) => {
        this.searchPage = 1;
        void this.runSearch(filters, false);
      });
  }

  protected loadMoreResults(): void {
    this.searchPage += 1;
    void this.runSearch(this.searchFilters(), true);
  }

  private async runSearch(
    filters: { q: string; sportId: string; location: string; dateFrom: string },
    append: boolean,
  ): Promise<void> {
    this.searchLoading.set(true);
    try {
      const result = await this.api.searchTournaments({
        q: filters.q || undefined,
        sportId: filters.sportId || undefined,
        location: filters.location || undefined,
        dateFrom: filters.dateFrom || undefined,
        page: this.searchPage,
        pageSize: PAGE_SIZE,
      });
      this.searchItems.set(append ? [...this.searchItems(), ...result.items] : result.items);
      this.searchTotal.set(result.total);
      this.hasSearched.set(true);
    } finally {
      this.searchLoading.set(false);
    }
  }

  protected logoUrl(url: string | null): string | null {
    return this.assetUrl.resolve(url);
  }

  protected onModeChange(next: ThemeMode): void {
    this.themeService.setMode(document.documentElement, next);
  }

  protected onLanguageChange(code: string): void {
    this.languageService.setLanguage(code as LanguageCode);
  }

  protected goToTournament(tournament: PublicTournamentSummary): void {
    void this.router.navigate(['/', tournament.slug]);
  }

  protected viewEvents(): void {
    this.showHero.set(false);
  }

  protected backToHero(): void {
    this.showHero.set(true);
  }

  protected toggleSettings(): void {
    this.showSettings.update((shown) => !shown);
  }

  protected shareApp(): void {
    void this.shareButton()?.triggerShare();
  }
}
