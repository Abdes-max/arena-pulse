import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { AddressSearchService, PublicApiService } from 'api-client';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AutocompleteField, Button, Select, SelectOption, TextField } from 'design-system';
import { AGE_CATEGORIES, PublicSport } from 'shared-models';
import { OrganizerAuthService } from '../../core/auth.service';
import { knockoutSizesFor, previewPlateau } from '../../core/plateau-preview';
import { OrganizerTournamentsService } from '../../core/tournaments.service';

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
 * Mobile port of apps/web's quick-plateau.page.ts: one screen for a
 * single-day plateau (placeholder teams, fields, pools and calendar created
 * in one call), then straight into the wizard's Équipes step to rename the
 * "Équipe N" placeholders -- and its Publication step, which already knows
 * the IAP/Stripe payment paths, for publishing.
 */
@Component({
  selector: 'app-organizer-quick-plateau-page',
  imports: [
    AutocompleteField,
    Button,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    Select,
    TextField,
    TranslocoPipe,
  ],
  templateUrl: './quick-plateau.page.html',
  styleUrl: './quick-plateau.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerQuickPlateauPage {
  private readonly auth = inject(OrganizerAuthService);
  private readonly publicApi = inject(PublicApiService);
  private readonly tournamentsApi = inject(OrganizerTournamentsService);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

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
  // Pause between the pools and the phase finale (shown only with a phase finale).
  protected readonly breakBetweenPhasesMinutes = signal('15');
  // Phase finale: '' = none, else the bracket size (2 = final, 4 = semis...)
  // -- same choices as apps/web's quick-plateau.page.ts.
  protected readonly knockoutSize = signal('');
  // Predefined list (U5..U20, Senior, Vétéran) -- same as apps/web's; '' = not specified.
  protected readonly categoryOptions = computed<SelectOption[]>(() => [
    { value: '', label: this.transloco.translate('organizer.quickPlateau.categoryNone') },
    ...AGE_CATEGORIES.map((category) => ({ value: category, label: category })),
  ]);
  protected readonly thirdPlaceMatch = signal(false);
  protected readonly venueName = signal('');
  private readonly venueAddress = signal<string | null>(null);
  protected readonly venueSearch = inject(AddressSearchService).autocomplete(() =>
    this.transloco.getActiveLang(),
  );

  private readonly knockoutSizes = computed(() =>
    knockoutSizesFor(toInt(this.teamCount()), toInt(this.poolCount())),
  );
  protected readonly knockoutOptions = computed<SelectOption[]>(() => {
    const t = (key: string) => this.transloco.translate('organizer.quickPlateau.knockout.' + key);
    return [
      { value: '', label: t('none') },
      ...this.knockoutSizes().map((size) => ({ value: String(size), label: t(String(size)) })),
    ];
  });
  private readonly effectiveKnockoutSize = computed(() => {
    const size = toInt(this.knockoutSize());
    return this.knockoutSizes().includes(size) ? size : null;
  });

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  private readonly sports = signal<PublicSport[]>([]);
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
      breakBetweenPhasesMinutes: toInt(this.breakBetweenPhasesMinutes()),
      knockoutSize: this.effectiveKnockoutSize(),
      thirdPlaceMatch: this.thirdPlaceMatch(),
    }),
  );

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
    void this.publicApi.listSports().then(
      (sports) => {
        this.sports.set(sports);
        // Plateaux are overwhelmingly youth football -- preselect it when present.
        const football = sports.find((sport) => /foot/i.test(sport.name)) ?? sports[0];
        if (football && !this.sportId()) {
          this.sportId.set(football.id);
        }
      },
      () => this.errorMessage.set('organizer.quickPlateau.errors.loadSports'),
    );
  }

  /** Pools followed by a phase finale: two phases, so a pause between them. */
  protected hasTwoPhases(): boolean {
    return this.effectiveKnockoutSize() !== null;
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

  protected async cancel(): Promise<void> {
    await this.router.navigateByUrl('/organizer/tournaments');
  }

  protected async submit(): Promise<void> {
    const organizationId = this.auth.organizations()[0]?.id;
    if (!organizationId || !this.canSubmit()) {
      return;
    }
    this.errorMessage.set(null);
    this.submitting.set(true);
    try {
      const poolCount = toInt(this.poolCount());
      const tournament = await this.tournamentsApi.createQuickPlateau(organizationId, {
        name: this.name().trim(),
        sportId: this.sportId(),
        date: this.date(),
        startDateTime: new Date(`${this.date()}T${this.startTime()}`).toISOString(),
        teamCount: toInt(this.teamCount()),
        fieldCount: toInt(this.fieldCount()),
        poolCount,
        matchDurationMinutes: toInt(this.matchDurationMinutes()),
        breakDurationMinutes: toInt(this.breakDurationMinutes()),
        ...(this.effectiveKnockoutSize() && {
          breakBetweenPhasesMinutes: toInt(this.breakBetweenPhasesMinutes()),
          knockoutSize: this.effectiveKnockoutSize()!,
          thirdPlaceMatch: this.hasThirdPlaceOption() && this.thirdPlaceMatch(),
        }),
        ...(this.venueName().trim() && { venueName: this.venueName().trim() }),
        ...(this.venueAddress() && { venueAddress: this.venueAddress()! }),
        ...(this.categoryName().trim() && { categoryName: this.categoryName().trim() }),
      });
      await this.router.navigate(['/organizer/tournaments', tournament.id, 'edit'], {
        queryParams: { step: 2 },
      });
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 400
          ? 'organizer.quickPlateau.errors.invalid'
          : 'organizer.quickPlateau.errors.generic',
      );
    } finally {
      this.submitting.set(false);
    }
  }
}
