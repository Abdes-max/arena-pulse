import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { PublicApiService } from 'api-client';
import { Button, Select, SelectOption, TextField } from 'design-system';
import { Category } from 'shared-models';
import { TournamentContextService } from '../../core/tournament-context.service';

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
  imports: [ReactiveFormsModule, Button, Select, TextField],
  templateUrl: './register.page.html',
  styleUrl: './register.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  private readonly formBuilder = inject(FormBuilder);
  private readonly api = inject(PublicApiService);
  private readonly router = inject(Router);
  protected readonly context = inject(TournamentContextService);

  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedCategoryId = signal('');

  protected readonly categoryOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Choisir une catégorie', disabled: true },
    ...this.categories().map((category) => ({
      value: category.id,
      label: `${category.name} — ${formatFee(category)}`,
    })),
  ]);

  protected readonly selectedCategory = computed(
    () => this.categories().find((category) => category.id === this.selectedCategoryId()) ?? null,
  );
  protected readonly selectedCategoryFee = computed(() => {
    const category = this.selectedCategory();
    return category ? formatFee(category) : '';
  });

  protected readonly form = this.formBuilder.nonNullable.group({
    teamName: ['', Validators.required],
    managerEmail: ['', [Validators.required, Validators.email]],
    managerPhone: [''],
    players: this.formBuilder.array([this.buildPlayerGroup()]),
  });

  protected get playersArray(): FormArray {
    return this.form.controls.players;
  }

  constructor() {
    void this.load();
  }

  private buildPlayerGroup() {
    return this.formBuilder.nonNullable.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      jerseyNumber: [''],
    });
  }

  protected addPlayer(): void {
    this.playersArray.push(this.buildPlayerGroup());
  }

  protected removePlayer(index: number): void {
    if (this.playersArray.length > 1) {
      this.playersArray.removeAt(index);
    }
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
      const categories = await this.api.listCategories(slug);
      this.categories.set(categories);
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
      const { teamName, managerEmail, managerPhone, players } = this.form.getRawValue();
      const result = await this.api.createRegistration(slug, categoryId, {
        teamName,
        managerEmail,
        managerPhone: managerPhone || undefined,
        players: players.map((player) => ({
          firstName: player.firstName,
          lastName: player.lastName,
          jerseyNumber: player.jerseyNumber ? Number(player.jerseyNumber) : undefined,
        })),
      });
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }
      await this.router.navigate(['/', slug, 'register', 'success']);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        this.errorMessage.set('Une équipe porte déjà ce nom pour ce tournoi.');
      } else {
        this.errorMessage.set("Impossible d'envoyer cette inscription, réessayez.");
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
