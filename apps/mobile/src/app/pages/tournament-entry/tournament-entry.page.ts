import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonToolbar } from '@ionic/angular/standalone';
import { AssetUrlService, PublicApiService } from 'api-client';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  Button,
  LanguageSwitcher,
  Logo,
  ShareButton,
  TextField,
  ThemeModeToggle,
  TournamentCard,
  TournamentMarquee,
} from 'design-system';
import { LanguageCode, LanguageService, SUPPORTED_LANGUAGES, ThemeMode, ThemeService } from 'design-tokens';
import { PublicTournamentSummary } from 'shared-models';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-tournament-entry-page',
  imports: [
    Button,
    IonContent,
    IonHeader,
    IonToolbar,
    LanguageSwitcher,
    Logo,
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
  private readonly assetUrl = inject(AssetUrlService);

  protected readonly tournaments = signal<PublicTournamentSummary[]>([]);
  protected readonly query = signal('');
  // Governs everything below the hero, same as apps/web's landing.page --
  // the hero itself stays forced dark regardless (data-mode="dark" scoped
  // on tournament-entry-page__hero in the template).
  protected readonly mode = this.themeService.mode;
  protected readonly language = this.languageService.language;
  protected readonly languages = SUPPORTED_LANGUAGES;

  // There's no tournament-creation flow in this app itself -- these all just
  // hand off to the web app, same as apps/web's landing page hero ("Créer
  // mon tournoi"). Moved out of the toolbar into the Paramètres panel below
  // (grouped with the rest of the app's external/legal links) so the
  // toolbar itself stays down to just the logo, the settings button and the
  // theme toggle.
  protected readonly createTournamentUrl = `${environment.webUrl}/register`;
  protected readonly loginUrl = `${environment.webUrl}/login`;
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

  // Same pattern as apps/web's LandingPage (and team-search.page's
  // filteredTeams) -- client-side filter over a wider-than-displayed fetch.
  protected readonly filteredTournaments = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) {
      return this.tournaments();
    }
    return this.tournaments().filter(
      (t) => t.name.toLowerCase().includes(q) || t.sportName.toLowerCase().includes(q),
    );
  });

  // ap-tournament-marquee's TournamentMarqueeItem needs a resolved (absolute)
  // logoUrl -- it's a dumb presenter, same reason ap-tournament-card gets
  // its own [logoUrl]="logoUrl(t.logoUrl)" binding per-card below instead.
  protected readonly marqueeTournaments = computed(() =>
    this.tournaments().map((t) => ({ ...t, logoUrl: this.logoUrl(t.logoUrl) })),
  );

  constructor() {
    void this.api.listTournaments(50).then((tournaments) => this.tournaments.set(tournaments));
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

  protected onQueryChange(value: string): void {
    this.query.set(value);
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
