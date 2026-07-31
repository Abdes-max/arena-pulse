import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonTitle,
  IonToolbar,
} from '@ionic/angular/standalone';

@Component({
  selector: 'app-tournament-entry-page',
  imports: [IonHeader, IonToolbar, IonTitle, IonContent, IonInput, IonButton],
  templateUrl: './tournament-entry.page.html',
  styleUrl: './tournament-entry.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentEntryPage {
  private readonly router = inject(Router);

  protected readonly slug = signal('');

  protected onSlugChange(value: string | number | null | undefined): void {
    this.slug.set(String(value ?? ''));
  }

  protected go(): void {
    const slug = this.slug().trim();
    if (slug) {
      void this.router.navigate(['/', slug]);
    }
  }
}
