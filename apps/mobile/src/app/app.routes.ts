import { Routes } from '@angular/router';
import { organizerAuthGuard, organizerGuestGuard } from './organizer/core/auth.guard';

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
    canActivate: [organizerGuestGuard],
    loadComponent: () =>
      import('./organizer/pages/register/register.page').then((m) => m.OrganizerRegisterPage),
  },
  {
    path: 'organizer/login',
    canActivate: [organizerGuestGuard],
    loadComponent: () =>
      import('./organizer/pages/login/login.page').then((m) => m.OrganizerLoginPage),
  },
  {
    path: 'organizer/forgot-password',
    canActivate: [organizerGuestGuard],
    loadComponent: () =>
      import('./organizer/pages/forgot-password/forgot-password.page').then(
        (m) => m.OrganizerForgotPasswordPage,
      ),
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
    path: 'organizer/account',
    canActivate: [organizerAuthGuard],
    loadComponent: () =>
      import('./organizer/pages/account/account.page').then((m) => m.OrganizerAccountPage),
  },
  // Registered ahead of 'organizer/tournaments/:something' would-be routes
  // (there are none yet, but this keeps the static 'new' segment safely out
  // of a future ':tournamentId' param's way, same reasoning as ':slug' below).
  {
    path: 'organizer/tournaments/new-plateau',
    canActivate: [organizerAuthGuard],
    loadComponent: () =>
      import('./organizer/pages/quick-plateau/quick-plateau.page').then(
        (m) => m.OrganizerQuickPlateauPage,
      ),
  },
  {
    path: 'organizer/tournaments/new',
    canActivate: [organizerAuthGuard],
    loadComponent: () =>
      import('./organizer/pages/tournament-wizard/tournament-wizard.page').then(
        (m) => m.OrganizerTournamentWizardPage,
      ),
  },
  // Same component as 'new' above, in edit mode -- see
  // OrganizerTournamentWizardPage's own constructor (reads paramMap's 'id').
  {
    path: 'organizer/tournaments/:id/edit',
    canActivate: [organizerAuthGuard],
    loadComponent: () =>
      import('./organizer/pages/tournament-wizard/tournament-wizard.page').then(
        (m) => m.OrganizerTournamentWizardPage,
      ),
  },
  // PR 4 ("parité complète admin web <-> mobile", see the plan file) --
  // native ports of apps/web/src/app/admin/pages/{scores,standings}.
  {
    // The day-of page (by rotation) is the one Scores page now.
    path: 'organizer/tournaments/:id/scores',
    canActivate: [organizerAuthGuard],
    loadComponent: () =>
      import('./organizer/pages/live/live.page').then((m) => m.OrganizerLivePage),
  },
  {
    path: 'organizer/tournaments/:id/live',
    redirectTo: 'organizer/tournaments/:id/scores',
  },
  {
    path: 'organizer/tournaments/:id/registrations',
    canActivate: [organizerAuthGuard],
    loadComponent: () =>
      import('./organizer/pages/registrations/registrations.page').then(
        (m) => m.OrganizerRegistrationsPage,
      ),
  },
  {
    path: 'organizer/tournaments/:id/structure',
    canActivate: [organizerAuthGuard],
    loadComponent: () =>
      import('./organizer/pages/structure/structure.page').then((m) => m.OrganizerStructurePage),
  },
  {
    path: 'organizer/tournaments/:id/standings',
    canActivate: [organizerAuthGuard],
    loadComponent: () =>
      import('./organizer/pages/standings/standings.page').then((m) => m.OrganizerStandingsPage),
  },
  {
    path: 'organizer/tournaments/:id/stats',
    canActivate: [organizerAuthGuard],
    loadComponent: () =>
      import('./organizer/pages/stats/stats.page').then((m) => m.OrganizerStatsPage),
  },
  // Static, so it has to come before the ':slug' catch-all below.
  {
    path: 'notifications',
    loadComponent: () =>
      import('./pages/notifications/notifications.page').then((m) => m.NotificationsPage),
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
