import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Feature {
  title: string;
  description: string;
}

@Component({
  selector: 'app-landing-page',
  imports: [RouterLink],
  templateUrl: './landing.page.html',
  styleUrl: './landing.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPage {
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
