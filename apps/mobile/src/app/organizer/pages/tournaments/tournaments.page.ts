import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  IonContent,
  IonHeader,
  IonRefresher,
  IonRefresherContent,
  IonTitle,
  IonToolbar,
  RefresherCustomEvent,
} from '@ionic/angular/standalone';
import { AssetUrlService, PublicApiService } from 'api-client';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Badge, Logo, Select, SelectOption, ThemeModeToggle } from 'design-system';
import { ThemeMode, ThemeService } from 'design-tokens';
import { isTournamentPast } from 'shared-models';
import { OrganizerAuthService } from '../../core/auth.service';
import { AdminUiMode, OrganizerTournament } from '../../core/models';
import { OrganizerTournamentsService } from '../../core/tournaments.service';
import { OrganizerDashboard } from './organizer-dashboard';
import { OrganizerSetupGuide } from './organizer-setup-guide';

// Real "Mes tournois" list -- replaces the PR 1 placeholder (register ->
// verify -> login -> land somewhere real) now that the creation wizard
// (tournament-wizard.page.ts) gives this a genuine destination. Mirrors the
// mockup's "Écran 3" (adaptive-leaping-elephant.md, Étape 0): a card per
// tournament with a status badge + sport, a floating "+ Nouveau tournoi"
// button, and (PR 4) two small actions per card for Scores/Classements.
// Tapping the card body itself opens the wizard in edit mode (feat/193 PR
// 3, openTournament() below). Remaining admin-web-only pages (arbitres,
// structure/calendrier manual editing, sponsors...) are tracked as PR 5+
// in the plan file's "PR 4+ -- parité complète" section.
// Same filters as apps/web's tournament list: status (default "Non archivé",
// archived editions stay out of the way) and period (à venir / passés).
type StatusFilter = OrganizerTournament['status'] | 'ALL' | 'NOT_ARCHIVED';
type TimeFilter = 'ALL' | 'UPCOMING' | 'PAST';

const STATUS_FILTERS: StatusFilter[] = [
  'NOT_ARCHIVED',
  'ALL',
  'DRAFT',
  'PUBLISHED',
  'UNPUBLISHED',
  'ARCHIVED',
];
const TIME_FILTERS: TimeFilter[] = ['ALL', 'UPCOMING', 'PAST'];

@Component({
  selector: 'app-organizer-tournaments-page',
  imports: [
    Badge,
    IonContent,
    IonHeader,
    IonRefresher,
    IonRefresherContent,
    IonTitle,
    IonToolbar,
    Logo,
    OrganizerDashboard,
    OrganizerSetupGuide,
    RouterLink,
    Select,
    ThemeModeToggle,
    TranslocoPipe,
  ],
  templateUrl: './tournaments.page.html',
  styleUrl: './tournaments.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerTournamentsPage {
  private readonly auth = inject(OrganizerAuthService);
  private readonly tournamentsApi = inject(OrganizerTournamentsService);
  private readonly router = inject(Router);
  private readonly themeService = inject(ThemeService);
  protected readonly mode = this.themeService.mode;
  // Account menu under the avatar (header).
  protected readonly menuOpen = signal(false);
  private readonly assetUrl = inject(AssetUrlService);
  private readonly publicApi = inject(PublicApiService);
  private readonly transloco = inject(TranslocoService);

  protected readonly user = this.auth.currentUser;
  protected readonly organizations = this.auth.organizations;
  protected readonly tournaments = signal<OrganizerTournament[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly simpleMode = this.auth.simpleMode;

  protected readonly selectedStatus = signal<StatusFilter>('NOT_ARCHIVED');
  protected readonly selectedTime = signal<TimeFilter>('ALL');
  // Only the tournaments taking pre-registrations right now.
  protected readonly openOnly = signal(false);
  protected readonly timeFilters = TIME_FILTERS;
  protected readonly filteredTournaments = computed(() => {
    const status = this.selectedStatus();
    const time = this.selectedTime();
    const now = new Date();
    return this.tournaments().filter((tournament) => {
      const statusOk =
        status === 'ALL' ||
        (status === 'NOT_ARCHIVED'
          ? tournament.status !== 'ARCHIVED'
          : tournament.status === status);
      const timeOk = time === 'ALL' || isTournamentPast(tournament, now) === (time === 'PAST');
      return statusOk && timeOk && (!this.openOnly() || this.registrationsPossible(tournament));
    });
  });

  /** Bumped on every successful load so the setup guide re-reads its progress. */
  protected readonly guideRefresh = signal(0);

  /**
   * "À la une": the tournaments not yet over (published first, then by date)
   * -- the first is the one the organizer most likely opens the app for, the
   * arrows go through the rest. None left: every tournament, most recent
   * first, under a plain "Vos tournois" title (featuredUpcoming).
   */
  protected readonly featuredUpcoming = computed(() =>
    this.tournaments().some((t) => t.status !== 'ARCHIVED' && !isTournamentPast(t)),
  );
  protected readonly featuredList = computed<OrganizerTournament[]>(() => {
    const byDate = (a: OrganizerTournament, b: OrganizerTournament) =>
      (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999');
    if (!this.featuredUpcoming()) {
      return [...this.tournaments()].sort((a, b) => byDate(b, a));
    }
    const rank = (t: OrganizerTournament) => (t.status === 'PUBLISHED' ? 0 : 1);
    return this.tournaments()
      .filter((t) => t.status !== 'ARCHIVED' && !isTournamentPast(t))
      .sort((a, b) => rank(a) - rank(b) || byDate(a, b));
  });
  protected readonly featuredIndex = signal(0);
  protected readonly featured = computed<OrganizerTournament | null>(() => {
    const list = this.featuredList();
    return list[Math.min(this.featuredIndex(), list.length - 1)] ?? null;
  });

  /** Previous (-1) / next (+1) featured tournament, wrapping around. */
  protected stepFeatured(delta: number): void {
    const count = this.featuredList().length;
    if (count > 1) {
      this.featuredIndex.update((i) => (Math.min(i, count - 1) + delta + count) % count);
    }
  }

  // Swipe left/right on the featured card, same as the arrows.
  private swipeStartX: number | null = null;
  protected onFeaturedTouchStart(event: TouchEvent): void {
    this.swipeStartX = event.touches[0]?.clientX ?? null;
  }
  protected onFeaturedTouchEnd(event: TouchEvent): void {
    const endX = event.changedTouches[0]?.clientX;
    if (this.swipeStartX !== null && endX !== undefined && Math.abs(endX - this.swipeStartX) > 48) {
      this.stepFeatured(endX < this.swipeStartX ? 1 : -1);
    }
    this.swipeStartX = null;
  }

  /** Today's date, as the greeting's small line ("samedi 14 novembre"). */
  protected readonly today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  /** The featured tournament plays today. */
  protected playsToday(tournament: OrganizerTournament): boolean {
    const day = new Date().toISOString().slice(0, 10);
    const start = tournament.startDate?.slice(0, 10);
    const end = (tournament.endDate ?? tournament.startDate)?.slice(0, 10);
    return !!start && !!end && start <= day && day <= end;
  }

  /** "14 nov." -- the featured card's date tile. */
  protected shortDate(tournament: OrganizerTournament): string {
    return tournament.startDate
      ? new Date(tournament.startDate).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          timeZone: 'UTC',
        })
      : '–';
  }

  // Same account as a team manager: a way to its space when it has requests.
  protected readonly hasRegistrations = signal(false);

  private loadedOnce = false;

  constructor() {
    void this.load();
    void this.publicApi
      .listMyRegistrations()
      .then((mine) => this.hasRegistrations.set(mine.length > 0))
      .catch(() => undefined);
  }

  /** Teams can pre-register right now: switched on, and the tournament is public. */
  protected registrationsPossible(tournament: OrganizerTournament): boolean {
    return !!tournament.registrationsOpen && tournament.status === 'PUBLISHED';
  }

  protected toggleOpenOnly(): void {
    this.openOnly.update((value) => !value);
  }

  /** Ionic keeps this page alive when navigating away: reload (quietly) on every return. */
  ionViewWillEnter(): void {
    if (this.loadedOnce) {
      void this.load(true);
    }
  }

  protected async onRefresh(event: RefresherCustomEvent): Promise<void> {
    await this.load(true);
    await event.target.complete();
  }

  /** quiet: keep the current list on screen while reloading (no full-page spinner). */
  private async load(quiet = false): Promise<void> {
    const organizationId = this.organizations()[0]?.id;
    if (!organizationId) {
      this.loading.set(false);
      return;
    }
    if (!quiet) {
      this.loading.set(true);
    }
    this.errorMessage.set(null);
    try {
      const tournaments = await this.tournamentsApi.listTournaments(organizationId);
      this.tournaments.set(tournaments);
      this.guideRefresh.update((n) => n + 1);
      this.loadedOnce = true;
    } catch {
      this.errorMessage.set('organizer.tournaments.list.errorGeneric');
    } finally {
      this.loading.set(false);
    }
  }

  // [options] is a plain input, so it can't go through the transloco pipe.
  protected statusOptions(): SelectOption[] {
    return STATUS_FILTERS.map((value) => ({
      value,
      label: this.transloco.translate(`organizer.tournaments.list.status.${value}`),
    }));
  }

  protected timeLabel(value: TimeFilter): string {
    return this.transloco.translate(`organizer.tournaments.list.time.${value}`);
  }

  protected onStatusFilterChange(value: string): void {
    this.selectedStatus.set(value as StatusFilter);
  }

  protected setTimeFilter(value: TimeFilter): void {
    this.selectedTime.set(value);
  }

  protected setUiMode(mode: AdminUiMode): void {
    void this.auth.setAdminUiMode(mode);
  }

  protected logoUrl(url: string | null): string | null {
    return this.assetUrl.resolve(url);
  }

  /**
   * Native edit mode (feat/193 PR 3) -- same wizard component as "Créer un
   * tournoi", reading the route's 'id' param to preload this tournament's
   * data instead of starting from scratch (see tournament-wizard.page.ts's
   * own doc comment). Used to bounce out to the admin-web page in the
   * system browser; the richer editor (arbitres, scores, classement...)
   * genuinely stays admin-web-only, but the organizer no longer leaves the
   * app just to rename a tournament or add a team.
   */
  protected async openTournament(tournament: OrganizerTournament): Promise<void> {
    await this.router.navigateByUrl(`/organizer/tournaments/${tournament.id}/edit`);
  }

  /** PR 4 -- card action, stops propagation so it doesn't also trigger openTournament() above. */
  protected async openScores(event: Event, tournament: OrganizerTournament): Promise<void> {
    event.stopPropagation();
    await this.router.navigateByUrl(`/organizer/tournaments/${tournament.id}/scores`);
  }

  /** Pools, brackets and their settings, after creation -- same as openScores() above. */
  /** Pre-registrations to approve -- same as openScores() above. */
  protected async openRegistrations(event: Event, tournament: OrganizerTournament): Promise<void> {
    event.stopPropagation();
    await this.router.navigateByUrl(`/organizer/tournaments/${tournament.id}/registrations`);
  }

  protected async openStructure(event: Event, tournament: OrganizerTournament): Promise<void> {
    event.stopPropagation();
    await this.router.navigateByUrl(`/organizer/tournaments/${tournament.id}/structure`);
  }

  /** PR 4 -- same as openScores() above. */
  protected async openStandings(event: Event, tournament: OrganizerTournament): Promise<void> {
    event.stopPropagation();
    await this.router.navigateByUrl(`/organizer/tournaments/${tournament.id}/standings`);
  }

  /** Same as openScores() above. */
  protected async openStats(event: Event, tournament: OrganizerTournament): Promise<void> {
    event.stopPropagation();
    await this.router.navigateByUrl(`/organizer/tournaments/${tournament.id}/stats`);
  }

  // "12 oct. 2026 · Stade" under the name -- same as apps/web's
  // tournament-list.page.ts metaLine.
  /** Categories, then format and level, as small chips under the meta line. */
  protected detailChips(tournament: OrganizerTournament): string[] | null {
    const chips = [...(tournament.categoryNames ?? []), tournament.format, tournament.level].filter(
      (chip): chip is string => !!chip,
    );
    return chips.length ? chips : null;
  }

  protected metaLine(tournament: OrganizerTournament): string | null {
    const format = (iso: string) =>
      new Date(iso).toLocaleDateString(this.transloco.getActiveLang(), {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      });
    const start = tournament.startDate ? format(tournament.startDate) : null;
    const end = tournament.endDate ? format(tournament.endDate) : null;
    const dates = start && end && end !== start ? `${start} – ${end}` : (start ?? end);
    return [dates, tournament.venueName].filter(Boolean).join(' · ') || null;
  }

  protected statusLabel(status: OrganizerTournament['status']): string {
    return this.transloco.translate(`organizer.tournaments.list.status.${status}`);
  }

  protected badgeStatus(
    status: OrganizerTournament['status'],
  ): 'draft' | 'published' | 'unpublished' | 'archived' {
    switch (status) {
      case 'PUBLISHED':
        return 'published';
      case 'UNPUBLISHED':
        return 'unpublished';
      case 'ARCHIVED':
        return 'archived';
      default:
        return 'draft';
    }
  }

  protected onModeChange(next: ThemeMode): void {
    this.themeService.setMode(document.documentElement, next, true);
  }

  protected async logout(): Promise<void> {
    this.menuOpen.set(false);
    await this.auth.logout();
    await this.router.navigateByUrl('/organizer/login');
  }
}
