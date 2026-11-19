import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  AssetUrlService,
  ClubSearchService,
  PublicApiService,
  clubDirectorySport,
} from 'api-client';
import { AutocompleteField, Button, Select, SelectOption, TextField } from 'design-system';
import { Category, PublicRegistrationInfo } from 'shared-models';
import { PlayerAuthService } from '../../core/player-auth.service';
import { TournamentContextService } from '../../core/tournament-context.service';
import { showErrorsInSnackbar } from '../../core/error-snackbar';

function formatFee(category: Category): string {
  if (category.registrationFeeCents === null || category.registrationFeeCents === 0) {
    return 'Gratuit';
  }
  const amount = (category.registrationFeeCents / 100).toLocaleString('fr-FR', {
    style: 'currency',
    currency: category.registrationFeeCurrency ?? 'eur',
  });
  return amount;
}

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, AutocompleteField, Button, RouterLink, Select, TextField],
  templateUrl: './register.page.html',
  styleUrl: './register.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly api = inject(PublicApiService);
  private readonly router = inject(Router);
  protected readonly context = inject(TournamentContextService);
  private readonly playerAuth = inject(PlayerAuthService);
  private readonly assetUrl = inject(AssetUrlService);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  // Anomalies show in the red snackbar, not inline (see showErrorsInSnackbar).
  private readonly errorSnackbar = showErrorsInSnackbar(this.errorMessage, { translate: false });

  protected readonly categories = signal<Category[]>([]);
  protected readonly info = signal<PublicRegistrationInfo | null>(null);
  /** Individual sport: one player, no team name nor roster. */
  protected readonly individual = computed(() => this.info()?.participantType === 'INDIVIDUAL');
  protected readonly remaining = computed(
    () =>
      this.info()?.categories.find((c) => c.id === this.selectedCategoryId())?.remaining ?? null,
  );
  protected readonly selectedCategoryId = signal('');
  // Several teams of the same club at once (numbered), within the organizer's
  // per-manager limit, counting what this manager already registered here.
  protected readonly alreadyMine = signal(0);
  protected readonly remainingAllowed = computed(
    () => (this.info()?.maxTeamsPerRegistrant ?? 1) - this.alreadyMine(),
  );
  protected readonly teamCount = signal('1');
  protected readonly teamCountOptions = computed<SelectOption[]>(() =>
    Array.from({ length: Math.min(10, Math.max(1, this.remainingAllowed())) }, (_, i) => ({
      value: String(i + 1),
      label: String(i + 1),
    })),
  );
  protected readonly numberedNames = computed(() => {
    const count = Number(this.teamCount());
    const name = this.form.controls.teamName.value.trim();
    return count > 1 && name
      ? Array.from({ length: count }, (_, i) => `${name} ${i + 1}`).join(', ')
      : '';
  });

  protected readonly categoryOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Choisir une catégorie', disabled: true },
    ...this.categories().map((category) => ({
      value: category.id,
      label: `${category.name} · ${formatFee(category)}`,
    })),
  ]);

  protected readonly selectedCategory = computed(
    () => this.categories().find((category) => category.id === this.selectedCategoryId()) ?? null,
  );
  protected readonly selectedCategoryFee = computed(() => {
    const category = this.selectedCategory();
    return category ? formatFee(category) : '';
  });

  // A team registers itself (name + the manager's contact): the roster is
  // the organizer's business once the team is confirmed. The phone is
  // required so the organizer can call the manager back. Individual sports
  // name their single player instead of a team.
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

  // Club search on the team name (sports with a club directory), same as
  // the organizer's Équipes tab: picking a club links it, and its crest
  // becomes the team logo once the organizer confirms the request.
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
        ? `Département ${club.department}`
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

  protected onCategoryChange(categoryId: string): void {
    this.selectedCategoryId.set(categoryId);
  }

  private async load(): Promise<void> {
    const slug = this.context.slug();
    if (!slug) {
      this.loading.set(false);
      return;
    }
    try {
      const [categories, info] = await Promise.all([
        this.api.listCategories(slug),
        this.api.getRegistrationInfo(slug),
      ]);
      this.categories.set(categories);
      this.info.set(info);
      const mine = await this.api.listMyRegistrations().catch(() => []);
      this.alreadyMine.set(
        mine.filter(
          (r) => r.tournament.slug === slug && r.status !== 'REJECTED' && r.status !== 'CANCELLED',
        ).length,
      );
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
      this.errorMessage.set('Impossible de charger les catégories de ce tournoi.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async submit(): Promise<void> {
    const slug = this.context.slug();
    const categoryId = this.selectedCategoryId();
    if (!slug || !categoryId || this.form.invalid || this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const { teamName, playerFirstName, playerLastName, managerEmail, managerPhone } =
        this.form.getRawValue();
      const result = await this.api.createRegistration(slug, categoryId, {
        teamName: this.individual() ? undefined : teamName,
        externalClubId: (!this.individual() && this.externalClubId()) || undefined,
        teamCount: this.individual() ? undefined : Number(this.teamCount()),
        managerEmail,
        managerPhone,
        players: this.individual()
          ? [{ firstName: playerFirstName, lastName: playerLastName }]
          : undefined,
      });
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }
      await this.router.navigate(['/', slug, 'register', 'success']);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        const message = (error.error as { message?: unknown } | null)?.message;
        this.errorMessage.set(
          typeof message === 'string' ? message : 'Une équipe porte déjà ce nom pour ce tournoi.',
        );
      } else {
        this.errorMessage.set("Impossible d'envoyer cette inscription, réessayez.");
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
