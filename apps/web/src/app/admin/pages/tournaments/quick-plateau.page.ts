import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AddressSearchService } from 'api-client';
import { AGE_CATEGORIES } from 'shared-models';
import { AutocompleteField, Button, Select, SelectOption, TextField } from 'design-system';
import { LanguageService } from 'design-tokens';
import { AuthService } from '../../core/auth.service';
import { Sport } from '../../core/models';
import { SportsService } from '../../core/sports.service';
import { TournamentsService } from '../../core/tournaments.service';
import { knockoutSizesFor, previewPlateau } from '../../shared/plateau-preview';

function toInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function todayIsoDate(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * One screen to set up a plateau -- the regular flow spreads the same thing
 * over the tournament form, Teams, Structure and Calendar. Teams are created
 * as "Équipe 1..N" so the calendar exists right away; the organizer renames
 * them afterwards (review step).
 */
@Component({
  selector: 'app-quick-plateau-page',
  imports: [AutocompleteField, Button, Select, TextField, TranslocoPipe, RouterLink],
  templateUrl: './quick-plateau.page.html',
  styleUrl: './quick-plateau.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickPlateauPage {
  private readonly authService = inject(AuthService);
  private readonly sportsService = inject(SportsService);
  private readonly tournamentsService = inject(TournamentsService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly languageService = inject(LanguageService);

  protected readonly name = signal('');
  protected readonly categoryName = signal('');
  protected readonly sportId = signal('');
  protected readonly date = signal(todayIsoDate());
  protected readonly startTime = signal('10:00');
  protected readonly teamCount = signal('6');
  protected readonly fieldCount = signal('2');
  protected readonly poolCount = signal('1');
  protected readonly matchDurationMinutes = signal('15');
  protected readonly breakDurationMinutes = signal('5');
  // Phase finale: '' = none, else the bracket size (2 = final, 4 = semis...).
  protected readonly knockoutSize = signal('');
  // Predefined list (U5..U20, Senior, Vétéran); '' = not specified.
  protected readonly categoryOptions = computed<SelectOption[]>(() => [
    {
      value: '',
      label: this.transloco.translate(
        'admin.quickPlateau.categoryNone',
        {},
        this.languageService.language(),
      ),
    },
    ...AGE_CATEGORIES.map((category) => ({ value: category, label: category })),
  ]);
  protected readonly thirdPlaceMatch = signal(false);
  protected readonly venueName = signal('');
  private readonly venueAddress = signal<string | null>(null);
  protected readonly venueSearch = inject(AddressSearchService).autocomplete(() =>
    this.languageService.language(),
  );

  /** Bracket sizes the current pools can feed -- the "Phase finale" choices. */
  private readonly knockoutSizes = computed(() =>
    knockoutSizesFor(toInt(this.teamCount()), toInt(this.poolCount())),
  );
  protected readonly knockoutOptions = computed<SelectOption[]>(() => {
    const lang = this.languageService.language();
    const t = (key: string) =>
      this.transloco.translate(`admin.quickPlateau.knockout.${key}`, {}, lang);
    return [
      { value: '', label: t('none') },
      ...this.knockoutSizes().map((size) => ({ value: String(size), label: t(String(size)) })),
    ];
  });
  /** The chosen size, or null if none / no longer possible with the current pools. */
  private readonly effectiveKnockoutSize = computed(() => {
    const size = toInt(this.knockoutSize());
    return this.knockoutSizes().includes(size) ? size : null;
  });

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  private readonly sports = signal<Sport[]>([]);
  protected readonly sportOptions = computed<SelectOption[]>(() =>
    this.sports().map((sport) => ({ value: sport.id, label: sport.name })),
  );

  protected readonly preview = computed(() =>
    previewPlateau({
      teamCount: toInt(this.teamCount()),
      fieldCount: toInt(this.fieldCount()),
      poolCount: toInt(this.poolCount()),
      matchDurationMinutes: toInt(this.matchDurationMinutes()),
      breakDurationMinutes: toInt(this.breakDurationMinutes()),
      knockoutSize: this.effectiveKnockoutSize(),
      thirdPlaceMatch: this.thirdPlaceMatch(),
    }),
  );

  /** Wall-clock end of the plateau, e.g. "12:37". */
  protected readonly endTime = computed(() => {
    const preview = this.preview();
    const [hours, minutes] = this.startTime().split(':').map(Number);
    if (!preview || Number.isNaN(hours) || Number.isNaN(minutes)) {
      return null;
    }
    const total = hours * 60 + minutes + preview.durationMinutes;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
  });

  protected readonly canSubmit = computed(
    () =>
      this.name().trim().length > 0 &&
      this.sportId() !== '' &&
      this.date() !== '' &&
      this.startTime() !== '' &&
      this.preview() !== null &&
      toInt(this.matchDurationMinutes()) >= 1 &&
      !this.submitting(),
  );

  constructor() {
    void this.loadSports();
  }

  private async loadSports(): Promise<void> {
    try {
      const sports = await this.sportsService.listSports();
      this.sports.set(sports);
      // Plateaux are overwhelmingly youth football -- preselect it when present.
      const football = sports.find((sport) => /foot/i.test(sport.name)) ?? sports[0];
      if (football && !this.sportId()) {
        this.sportId.set(football.id);
      }
    } catch {
      this.errorMessage.set('admin.quickPlateau.errors.loadSports');
    }
  }

  protected hasThirdPlaceOption(): boolean {
    return (this.effectiveKnockoutSize() ?? 0) >= 4;
  }

  protected toggleThirdPlace(event: Event): void {
    this.thirdPlaceMatch.set((event.target as HTMLInputElement).checked);
  }

  protected onVenueInput(value: string): void {
    this.venueName.set(value);
    this.venueAddress.set(null);
    this.venueSearch.query(value);
  }

  protected onVenueSuggestionSelect(index: number): void {
    const suggestion = this.venueSearch.suggestions()[index];
    if (!suggestion) {
      return;
    }
    this.venueName.set(suggestion.name);
    this.venueAddress.set(suggestion.address);
    this.venueSearch.clear();
  }

  protected async submit(): Promise<void> {
    const organizationId = this.authService.organizations()[0]?.id;
    if (!organizationId || !this.canSubmit()) {
      return;
    }
    this.errorMessage.set(null);
    this.submitting.set(true);
    try {
      const poolCount = toInt(this.poolCount());
      const tournament = await this.tournamentsService.createQuickPlateau(organizationId, {
        name: this.name().trim(),
        sportId: this.sportId(),
        date: this.date(),
        // Built from local date + time so the kickoff is in the organizer's timezone.
        startDateTime: new Date(`${this.date()}T${this.startTime()}`).toISOString(),
        teamCount: toInt(this.teamCount()),
        fieldCount: toInt(this.fieldCount()),
        poolCount,
        matchDurationMinutes: toInt(this.matchDurationMinutes()),
        breakDurationMinutes: toInt(this.breakDurationMinutes()),
        ...(this.effectiveKnockoutSize() && {
          knockoutSize: this.effectiveKnockoutSize()!,
          thirdPlaceMatch: this.hasThirdPlaceOption() && this.thirdPlaceMatch(),
        }),
        ...(this.venueName().trim() && { venueName: this.venueName().trim() }),
        ...(this.venueAddress() && { venueAddress: this.venueAddress()! }),
        ...(this.categoryName().trim() && { categoryName: this.categoryName().trim() }),
      });
      await this.router.navigate(['/admin/tournaments', tournament.id, 'review']);
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 400
          ? 'admin.quickPlateau.errors.invalid'
          : 'admin.quickPlateau.errors.generic',
      );
    } finally {
      this.submitting.set(false);
    }
  }
}
