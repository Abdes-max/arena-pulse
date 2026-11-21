import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AssetUrlService } from 'api-client';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Badge, BadgeStatus, Button, Select, SelectOption } from 'design-system';
import { DEFAULT_THEME, LanguageService, ThemeService } from 'design-tokens';
import { isTournamentPast } from 'shared-models';
import { AuthService } from '../../core/auth.service';
import { Tournament, TournamentStatus } from '../../core/models';
import { TournamentsService } from '../../core/tournaments.service';
import { OrganizationDashboard } from './organization-dashboard';
import { SetupGuide } from './setup-guide';
import { QrPosterDialog } from '../../shared/qr-poster-dialog/qr-poster-dialog';
import { showErrorsInSnackbar } from '../../../core/error-snackbar';

const STATUS_TO_BADGE: Record<TournamentStatus, BadgeStatus> = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  UNPUBLISHED: 'unpublished',
  ARCHIVED: 'archived',
};

// A tournament list grows mostly with things you're done with (past/
// cancelled editions get archived, not deleted) -- defaulting to "Non
// archivé" keeps that clutter out of the default view instead of "Tous",
// which is still one click away for anyone who does want to see everything.
type StatusFilter = TournamentStatus | 'ALL' | 'NOT_ARCHIVED';

// Maps each StatusFilter value to its admin.tournamentList.status.* key --
// reused both for the filter's own option list and (a subset of it) for the
// [label] override passed to ap-badge per row, so a translated label never
// falls back to ap-badge's own hardcoded French default.
const STATUS_LABEL_KEYS: Record<StatusFilter, string> = {
  NOT_ARCHIVED: 'admin.tournamentList.status.notArchived',
  ALL: 'admin.tournamentList.status.all',
  DRAFT: 'admin.tournamentList.status.draft',
  PUBLISHED: 'admin.tournamentList.status.published',
  UNPUBLISHED: 'admin.tournamentList.status.unpublished',
  ARCHIVED: 'admin.tournamentList.status.archived',
};

// "Période" filter, next to the status one: a tournament is past once its
// last day (endDate, else startDate) is before today -- see isTournamentPast.
type TimeFilter = 'ALL' | 'UPCOMING' | 'PAST';

const TIME_LABEL_KEYS: Record<TimeFilter, string> = {
  ALL: 'admin.tournamentList.time.all',
  UPCOMING: 'admin.tournamentList.time.upcoming',
  PAST: 'admin.tournamentList.time.past',
};

@Component({
  selector: 'app-tournament-list-page',
  imports: [
    Badge,
    Button,
    OrganizationDashboard,
    QrPosterDialog,
    RouterLink,
    Select,
    SetupGuide,
    TranslocoPipe,
  ],
  templateUrl: './tournament-list.page.html',
  styleUrl: './tournament-list.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentListPage {
  private readonly tournamentsService = inject(TournamentsService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly themeService = inject(ThemeService);
  private readonly languageService = inject(LanguageService);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly assetUrl = inject(AssetUrlService);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly statusBadge = STATUS_TO_BADGE;
  protected readonly simpleMode = this.authService.simpleMode;

  protected readonly tournaments = signal<Tournament[]>([]);
  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  // Anomalies show in the red snackbar, not inline (see showErrorsInSnackbar).
  private readonly errorSnackbar = showErrorsInSnackbar(this.errorMessage);

  // Recomputed on language switch -- [options] is a plain input, not
  // template markup, so there's no `| transloco` pipe to bind it through
  // (same reasoning as CollaboratorsPage.roleOptions).
  protected readonly statusOptions = computed<SelectOption[]>(() => {
    const lang = this.languageService.language();
    return (Object.keys(STATUS_LABEL_KEYS) as StatusFilter[]).map((value) => ({
      value,
      label: this.transloco.translate(STATUS_LABEL_KEYS[value], {}, lang),
    }));
  });
  protected readonly selectedStatus = signal<StatusFilter>('NOT_ARCHIVED');
  protected readonly timeOptions = computed<SelectOption[]>(() => {
    const lang = this.languageService.language();
    return (Object.keys(TIME_LABEL_KEYS) as TimeFilter[]).map((value) => ({
      value,
      label: this.transloco.translate(TIME_LABEL_KEYS[value], {}, lang),
    }));
  });
  protected readonly selectedTime = signal<TimeFilter>('ALL');
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
      return statusOk && timeOk;
    });
  });

  protected statusLabel(status: TournamentStatus): string {
    return this.transloco.translate(STATUS_LABEL_KEYS[status], {}, this.languageService.language());
  }

  constructor() {
    void this.load();

    // Not tied to any one tournament, so it stays on the fixed product
    // identity regardless of the last tournament theme picked in the edit
    // form -- restored to that picked theme (ThemeService.adminTheme) on
    // the way out (same pattern as CollaboratorsPage).
    this.themeService.setTheme(document.documentElement, DEFAULT_THEME);
    this.destroyRef.onDestroy(() => {
      this.themeService.setTheme(document.documentElement, this.themeService.adminTheme());
    });
  }

  private async load(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const tournaments = await this.tournamentsService.listTournaments(organizationId);
      this.tournaments.set(tournaments);
    } catch {
      this.errorMessage.set('admin.tournamentList.errorLoad');
    } finally {
      this.loading.set(false);
    }
  }

  protected onStatusFilterChange(value: string): void {
    this.selectedStatus.set(value as StatusFilter);
  }

  protected onTimeFilterChange(value: string): void {
    this.selectedTime.set(value as TimeFilter);
  }

  protected goToCreate(): void {
    void this.router.navigateByUrl('/admin/tournaments/new');
  }

  /**
   * "11 nov. 2026 · Stade Marius Réquier" (or a date range) -- small line
   * under each name. Dates are calendar days stored at UTC midnight, so
   * they're formatted in UTC to never shift by a day.
   */
  protected metaLine(tournament: Tournament): string | null {
    const format = (iso: string) =>
      new Date(iso).toLocaleDateString(this.languageService.language(), {
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

  protected goToCreatePlateau(): void {
    void this.router.navigateByUrl('/admin/tournaments/new-plateau');
  }

  protected editTournament(tournament: Tournament): void {
    void this.router.navigate(['/admin/tournaments', tournament.id]);
  }

  protected logoUrl(url: string | null): string | null {
    return this.assetUrl.resolve(url);
  }

  protected publicUrl(tournament: Tournament): string {
    return `/${tournament.slug}`;
  }

  // "Partager" menu: public link, slideshow (TV), QR code and export PDF in
  // one button, listing only what this tournament gives access to -- link,
  // slideshow and QR need it published, QR and PDF need premium features.
  protected readonly shareMenuFor = signal<string | null>(null);
  protected readonly qrFor = signal<Tournament | null>(null);

  protected shareActions(tournament: Tournament): {
    link: boolean;
    tv: boolean;
    qr: boolean;
    pdf: boolean;
  } {
    const published = tournament.status === 'PUBLISHED';
    const premium = tournament.premiumUnlocked ?? false;
    return { link: published, tv: published, qr: published && premium, pdf: premium };
  }

  protected hasShareActions(tournament: Tournament): boolean {
    const actions = this.shareActions(tournament);
    return actions.link || actions.tv || actions.qr || actions.pdf;
  }

  protected toggleShareMenu(tournament: Tournament): void {
    this.shareMenuFor.update((id) => (id === tournament.id ? null : tournament.id));
  }

  protected closeShareMenu(): void {
    this.shareMenuFor.set(null);
  }

  protected openQr(tournament: Tournament): void {
    this.closeShareMenu();
    this.qrFor.set(tournament);
  }

  protected closeQr(): void {
    this.qrFor.set(null);
  }

  // A scanned code has no "current page" to resolve a relative path against.
  protected publicAbsoluteUrl(tournament: Tournament): string {
    return `${window.location.origin}/${tournament.slug}`;
  }

  protected async duplicate(tournament: Tournament): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      await this.tournamentsService.duplicate(organizationId, tournament.id);
      await this.load();
    } catch {
      this.errorMessage.set('admin.tournamentList.errorDuplicate');
    }
  }

  protected async toggleArchive(tournament: Tournament): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      if (tournament.status === 'ARCHIVED') {
        await this.tournamentsService.unarchive(organizationId, tournament.id);
      } else {
        await this.tournamentsService.archive(organizationId, tournament.id);
      }
      await this.load();
    } catch {
      this.errorMessage.set('admin.tournamentList.errorArchiveToggle');
    }
  }
}
