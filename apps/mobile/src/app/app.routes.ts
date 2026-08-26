import { Routes } from '@angular/router';
import { organizerAuthGuard } from './organizer/core/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./pages/tournament-entry/tournament-entry.page').then((m) => m.TournamentEntryPage),
  },
  // Organizer auth + dashboard -- native (feat/193), no more hand-off to the
  // web app. Registered ahead of the ':slug' catch-all below, same reason
  // apps/web/src/app/app.routes.ts registers '/decouvrir' ahead of its own.
  {
    path: 'organizer/register',
    loadComponent: () =>
      import('./organizer/pages/register/register.page').then((m) => m.OrganizerRegisterPage),
  },
  {
    path: 'organizer/login',
    loadComponent: () =>
      import('./organizer/pages/login/login.page').then((m) => m.OrganizerLoginPage),
  },
  {
    path: 'organizer/tournaments',
    canActivate: [organizerAuthGuard],
    loadComponent: () =>
      import('./organizer/pages/tournaments/tournaments.page').then(
        (m) => m.OrganizerTournamentsPage,
      ),
  },
  {
    path: ':slug',
    loadComponent: () => import('./shell/tournament-shell').then((m) => m.TournamentShell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'home',
      },
      {
        path: 'home',
        loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'schedule',
        loadComponent: () => import('./pages/schedule/schedule.page').then((m) => m.SchedulePage),
      },
      {
        path: 'standings',
        loadComponent: () =>
          import('./pages/standings/standings.page').then((m) => m.StandingsPage),
      },
      {
        path: 'team',
        loadComponent: () =>
          import('./pages/team-search/team-search.page').then((m) => m.TeamSearchPage),
      },
      {
        path: 'favorites',
        loadComponent: () =>
          import('./pages/favorites/favorites.page').then((m) => m.FavoritesPage),
      },
      {
        path: 'team/:teamId',
        loadComponent: () =>
          import('./pages/team-detail/team-detail.page').then((m) => m.TeamDetailPage),
      },
    ],
  },
];
