import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import {
  AssetUrlService,
  ClubSearchService,
  PublicApiService,
  clubDirectorySport,
} from 'api-client';
import { AutocompleteField, Button, Select, SelectOption, TextField } from 'design-system';
import { LanguageService } from 'design-tokens';
import { Category, PublicRegistrationInfo } from 'shared-models';
import { showErrorsInSnackbar } from '../../../core/error-snackbar';
import { PlayerAuthService } from '../../../core/player-auth.service';
import { SnackbarService } from '../../../core/snackbar.service';
import { TournamentContextService } from '../../../core/tournament-context.service';

/**
 * Pre-registering a team from the app (same as apps/web's /:slug/register):
 * category, team name -- with the club search for sports that have a club
 * directory, its crest becomes the team logo on confirmation -- and the
 * manager's e-mail and (required) phone. No roster: the organizer manages
 * players once the team is confirmed. Individual sports name their player.
 */
@Component({
  selector: 'app-registration-page',
  imports: [
    ReactiveFormsModule,
    AutocompleteField,
    Button,
    IonContent,
    Select,
    TextField,
    TranslocoPipe,
  ],
  templateUrl: './registration.page.html',
  styleUrl: './registration.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegistrationPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly api = inject(PublicApiService);
  private readonly router = inject(Router);
  private readonly assetUrl = inject(AssetUrlService);
  private readonly playerAuth = inject(PlayerAuthService);
  private readonly snackbar = inject(SnackbarService);
  private readonly transloco = inject(TranslocoService);
  private readonly languageService = inject(LanguageService);
  private readonly context = inject(TournamentContextService);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  // Anomalies show in the red snackbar, not inline (see showErrorsInSnackbar).
  private readonly errorSnackbar = showErrorsInSnackbar(this.errorMessage, { translate: false });

  protected readonly categories = signal<Category[]>([]);
  protected readonly info = signal<PublicRegistrationInfo | null>(null);
  protected readonly individual = computed(() => this.info()?.participantType === 'INDIVIDUAL');
  protected readonly selectedCategoryId = signal('');
  protected readonly selectedCategory = computed(
    () => this.categories().find((category) => category.id === this.selectedCategoryId()) ?? null,
  );
  protected readonly remaining = computed(
    () =>
      this.info()?.categories.find((c) => c.id === this.selectedCategoryId())?.remaining ?? null,
  );
  protected readonly categoryOptions = computed<SelectOption[]>(() => [
    {
      value: '',
      label: this.transloco.translate('manager.form.chooseCategory'),
      disabled: true,
    },
    ...this.categories().map((category) => ({
      value: category.id,
      label: `${category.name} · ${this.feeLabel(category)}`,
    })),
  ]);

  protected readonly form = this.formBuilder.nonNullable.group({
    teamName: ['', Validators.required],
    playerFirstName: [''],
    playerLastName: [''],
    managerEmail: [
      this.playerAuth.currentPlayer()?.email ?? '',
      [Validators.required, Validators.email],
    ],
    managerPhone: ['', [Validators.required, Validators.minLength(6)]],
  });

  // Club search (same as the website's form and the organizer's Équipes).
  private readonly clubSport = computed(() =>
    clubDirectorySport(this.context.tournament()?.sportName),
  );
  protected readonly clubSearchAvailable = computed(
    () => this.clubSport() !== null && !this.individual(),
  );
  protected readonly useClubSearch = signal(true);
  protected readonly clubSearch = inject(ClubSearchService).autocomplete(
    () => this.clubSport() ?? 'football',
    'public/registrations/club-search',
  );
  protected readonly clubSuggestions = computed(() =>
    this.clubSearch.suggestions().map((club) => ({
      label: club.name,
      detail: club.department
        ? this.transloco.translate('manager.form.department', { code: club.department })
        : [club.postalCode, club.city].filter(Boolean).join(' ') || undefined,
      imageUrl: this.assetUrl.resolve(club.logoUrl),
    })),
  );
  protected readonly externalClubId = signal('');
  protected readonly clubLabel = signal('');
  protected readonly clubLogo = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected feeLabel(category: Category): string {
    if (!category.registrationFeeCents) {
      return this.transloco.translate('manager.form.free');
    }
    return new Intl.NumberFormat(this.languageService.language(), {
      style: 'currency',
      currency: category.registrationFeeCurrency ?? 'eur',
    }).format(category.registrationFeeCents / 100);
  }

  protected toggleClubSearch(event: Event): void {
    this.useClubSearch.set((event.target as HTMLInputElement).checked);
    this.clubSearch.clear();
  }

  protected onTeamNameInput(value: string): void {
    this.form.controls.teamName.setValue(value);
    this.clubSearch.query(value);
  }

  protected onClubSelect(index: number): void {
    const club = this.clubSearch.suggestions()[index];
    if (!club) {
      return;
    }
    this.form.controls.teamName.setValue(club.name);
    this.externalClubId.set(club.externalId);
    this.clubLabel.set(club.name);
    this.clubLogo.set(this.assetUrl.resolve(club.logoUrl));
    this.clubSearch.clear();
  }

  protected unlinkClub(): void {
    this.externalClubId.set('');
    this.clubLabel.set('');
    this.clubLogo.set(null);
  }

  private async load(): Promise<void> {
    const slug = this.context.slug();
    try {
      const [categories, info] = await Promise.all([
        this.api.listCategories(slug),
        this.api.getRegistrationInfo(slug),
      ]);
      this.categories.set(categories);
      this.info.set(info);
      if (categories.length === 1) {
        this.selectedCategoryId.set(categories[0].id);
      }
      if (info.participantType === 'INDIVIDUAL') {
        const { teamName, playerFirstName, playerLastName } = this.form.controls;
        teamName.clearValidators();
        playerFirstName.setValidators(Validators.required);
        playerLastName.setValidators(Validators.required);
        const player = this.playerAuth.currentPlayer();
        playerFirstName.setValue(player?.firstName ?? '');
        playerLastName.setValue(player?.lastName ?? '');
        for (const control of [teamName, playerFirstName, playerLastName]) {
          control.updateValueAndValidity();
        }
      }
    } catch {
      this.errorMessage.set(this.transloco.translate('manager.form.errorLoad'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async submit(): Promise<void> {
    const slug = this.context.slug();
    const categoryId = this.selectedCategoryId();
    if (!categoryId || this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    try {
      const { teamName, playerFirstName, playerLastName, managerEmail, managerPhone } =
        this.form.getRawValue();
      await this.api.createRegistration(slug, categoryId, {
        teamName: this.individual() ? undefined : teamName,
        externalClubId: (!this.individual() && this.externalClubId()) || undefined,
        managerEmail,
        managerPhone,
        players: this.individual()
          ? [{ firstName: playerFirstName, lastName: playerLastName }]
          : undefined,
      });
      this.snackbar.success(this.transloco.translate('manager.form.sent'));
      await this.router.navigateByUrl('/espace-responsable');
    } catch (error) {
      const message =
        error instanceof HttpErrorResponse
          ? (error.error as { message?: unknown } | null)?.message
          : null;
      this.errorMessage.set(
        typeof message === 'string' ? message : this.transloco.translate('manager.form.error'),
      );
    } finally {
      this.submitting.set(false);
    }
  }
}
