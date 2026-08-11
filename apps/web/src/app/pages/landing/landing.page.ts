import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicApiService } from 'api-client';
import { Logo, ThemeModeToggle, TournamentCard } from 'design-system';
import { ThemeMode, ThemeService } from 'design-tokens';
import { PublicTournamentSummary } from 'shared-models';

interface Feature {
  title: string;
  description: string;
}

@Component({
  selector: 'app-landing-page',
  imports: [RouterLink, Logo, ThemeModeToggle, TournamentCard],
  templateUrl: './landing.page.html',
  styleUrl: './landing.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPage {
  private readonly themeService = inject(ThemeService);
  private readonly api = inject(PublicApiService);

  protected readonly mode = this.themeService.mode;
  protected readonly tournaments = signal<PublicTournamentSummary[]>([]);

  constructor() {
    void this.api.listTournaments(8).then((tournaments) => this.tournaments.set(tournaments));
  }

  protected onModeChange(next: ThemeMode): void {
    this.themeService.setMode(document.documentElement, next);
  }

  protected readonly features: Feature[] = [
    {
      title: 'Poules et classements',
      description:
        'Générez vos poules, suivez les classements et les qualifications en temps réel, calculés automatiquement à chaque score saisi.',
    },
    {
      title: 'Tableaux à élimination',
      description:
        'Générez un tableau à élimination directe à partir des équipes qualifiées, avec avancement automatique des vainqueurs à chaque tour.',
    },
    {
      title: 'Calendrier et arbitrage',
      description:
        'Planifiez les matchs sur vos terrains et créneaux, assignez les arbitres, gérez les forfaits.',
    },
    {
      title: 'Site public par tournoi',
      description:
        'Chaque tournoi obtient automatiquement son propre site public : équipes, calendrier, classements et résultats en direct, sans rien à configurer.',
    },
  ];
}
