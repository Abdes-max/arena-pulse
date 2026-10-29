import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button, Select, SelectOption, TextField } from 'design-system';
import { AuthService } from '../../core/auth.service';
import { Sport } from '../../core/models';
import { SportsService } from '../../core/sports.service';
import { TournamentsService } from '../../core/tournaments.service';
import { previewPlateau } from '../../shared/plateau-preview';

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
  imports: [Button, Select, TextField, TranslocoPipe, RouterLink],
  templateUrl: './quick-plateau.page.html',
  styleUrl: './quick-plateau.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickPlateauPage {
  private readonly authService = inject(AuthService);
  private readonly sportsService = inject(SportsService);
  private readonly tournamentsService = inject(TournamentsService);
  private readonly router = inject(Router);

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
  protected readonly withFinal = signal(false);

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
      withFinal: this.withFinal() && toInt(this.poolCount()) <= 2,
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

  protected toggleFinal(event: Event): void {
    this.withFinal.set((event.target as HTMLInputElement).checked);
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
        withFinal: this.withFinal() && poolCount <= 2,
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
