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
  ShareButton,
  TextField,
  ThemeModeToggle,
  TournamentCard,
  TournamentMarquee,
  TimeFilter,
  TimeFilterValue,
} from 'design-system';
import {
  LanguageCode,
  LanguageService,
  SUPPORTED_LANGUAGES,
  ThemeMode,
  ThemeService,
} from 'design-tokens';
import { debounceTime } from 'rxjs';
import {
  PublicTournamentDirectoryItem,
  PublicTournamentSummary,
  isTournamentCurrentOrUpcoming,
} from 'shared-models';
import { environment } from '../../../environments/environment';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-tournament-entry-page',
  imports: [
    Button,
    TimeFilter,
    IonContent,
    IonHeader,
    IonToolbar,
    LanguageSwitcher,
    Logo,
    RouterLink,
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
  // For the « sports couverts » figure (same as apps/web's landing stats).
  protected readonly sportCount = signal(0);

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
  protected readonly showSettings = signal(false);
  // Lets the whole "Partager l'app" row act as the tap target (matching
  // every other row) instead of just the small ap-share-button icon inside
  // it: the row's own (click) is disabled with pointer-events: none on the
  // button (see the template/scss), and proxies the tap to the button's own
  // triggerShare() -- reuses its timeout/clipboard-fallback/failure-state
  // logic rather than duplicating it.
  private readonly shareButton = viewChild<ShareButton>('shareButton');
  private readonly content = viewChild<IonContent>('content');

  // ap-tournament-marquee's TournamentMarqueeItem needs a resolved (absolute)
  // logoUrl -- it's a dumb presenter, same reason ap-tournament-card gets
  // its own [logoUrl]="logoUrl(t.logoUrl)" binding per-card below instead.
  // Live/upcoming-only, same as apps/web's landing.page marqueeTournaments --
  // see isTournamentCurrentOrUpcoming's own doc comment for the endDate/
  // lastMatchDate fallback it applies.
  protected readonly marqueeTournaments = computed(() =>
    this.tournaments()
      .filter((t) => isTournamentCurrentOrUpcoming(t))
      .map((t) => ({ ...t, logoUrl: this.logoUrl(t.logoUrl) })),
  );

  // --- "Événements publiés" section: server-side directory search (mirrors
  // apps/web's discover.page, same debounce/filters/load-more logic) ---
  // Kept light on a phone: the name search, À venir / Passés and
  // "Inscriptions ouvertes" only (no sport/place/date, which apps/web's
  // Découvrir page still offers).
  protected readonly q = signal('');
  protected readonly timeFilter = signal<TimeFilterValue>('');
  protected readonly registrationOnly = signal(false);

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
    time: this.timeFilter(),
    registrationOnly: this.registrationOnly(),
  }));

  constructor() {
    void this.api.listTournaments(50).then((tournaments) => this.tournaments.set(tournaments));
    void this.api
      .listSports()
      .then((sports) => this.sportCount.set(sports.length))
      .catch(() => undefined);

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
    filters: {
      q: string;
      time: TimeFilterValue;
      registrationOnly: boolean;
    },
    append: boolean,
  ): Promise<void> {
    this.searchLoading.set(true);
    try {
      const result = await this.api.searchTournaments({
        q: filters.q || undefined,
        time: filters.time || undefined,
        registration: filters.registrationOnly ? 'open' : undefined,
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
    this.themeService.setMode(document.documentElement, next, true);
  }

  protected onLanguageChange(code: string): void {
    this.languageService.setLanguage(code as LanguageCode);
  }

  // Only ever needs the slug -- narrower than PublicTournamentSummary so it
  // stays compatible with ap-tournament-marquee's own, deliberately
  // decoupled TournamentMarqueeItem shape (see that component's doc
  // comment), which doesn't mirror every field PublicTournamentSummary
  // happens to carry.
  protected goToTournament(tournament: { slug: string }): void {
    void this.router.navigate(['/', tournament.slug]);
  }

  // The search opened full screen: the hero (a fixed ion-header, so the
  // list could never scroll it away) folds down to a back bar.
  protected readonly searchExpanded = signal(false);

  /** "M'inscrire à un tournoi": the search full screen, on upcoming tournaments taking registrations. */
  protected findRegistrations(): void {
    this.registrationOnly.set(true);
    this.timeFilter.set('upcoming');
    this.expandSearch();
  }

  /**
   * Opens the search full screen -- from the title, a filter or the button
   * above -- without the keyboard (dismissKeyboard), except when the search
   * field itself was tapped (`withKeyboard`).
   */
  protected expandSearch(withoutKeyboard = true): void {
    // Folded on pointerdown, before the field takes the focus: iOS then has
    // no reason to scroll the page up to reveal it under the keyboard (which
    // left a blank screen once the hero had folded away).
    if (this.searchExpanded() && !withoutKeyboard) {
      return;
    }
    this.searchExpanded.set(true);
    if (withoutKeyboard) {
      this.dismissKeyboard();
    }
    void this.content()?.scrollToTop(200);
  }

  protected collapseSearch(): void {
    this.dismissKeyboard();
    this.searchExpanded.set(false);
  }

  /** Closes the on-screen keyboard: blurs whatever field has the focus. */
  protected dismissKeyboard(): void {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.matches('input, textarea')) {
      active.blur();
    }
  }

  /** A tap anywhere but on a field closes the keyboard. */
  protected onContentTap(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (!target?.closest('input, textarea, select')) {
      this.dismissKeyboard();
    }
  }

  protected toggleSettings(): void {
    this.showSettings.update((shown) => !shown);
  }

  protected shareApp(): void {
    void this.shareButton()?.triggerShare();
  }
}
