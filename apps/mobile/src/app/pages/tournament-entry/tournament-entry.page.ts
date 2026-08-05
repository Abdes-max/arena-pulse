import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent } from '@ionic/angular/standalone';
import { Logo, TextField } from 'design-system';

@Component({
  selector: 'app-tournament-entry-page',
  imports: [IonContent, IonButton, Logo, TextField],
  templateUrl: './tournament-entry.page.html',
  styleUrl: './tournament-entry.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TournamentEntryPage {
  private readonly router = inject(Router);

  protected readonly slug = signal('');

  protected onSlugChange(value: string): void {
    this.slug.set(value);
  }

  protected go(): void {
    const slug = this.slug().trim();
    if (slug) {
      void this.router.navigate(['/', slug]);
    }
  }
}
