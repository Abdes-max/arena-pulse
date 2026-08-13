import { Routes } from '@angular/router';
import { authGuard } from './admin/core/auth.guard';
import { resetThemeGuard } from './admin/core/reset-theme.guard';
import { playerAuthGuard } from './core/player-auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/landing/landing.page').then((m) => m.LandingPage),
  },
  {
    path: 'login',
    loadComponent: () => import('./admin/pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    loadComponent: () => import('./admin/pages/register/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'accept-invitation/:token',
    loadComponent: () =>
      import('./admin/pages/accept-invitation/accept-invitation.page').then(
        (m) => m.AcceptInvitationPage,
      ),
  },
  {
    path: 'player/login',
    loadComponent: () =>
      import('./pages/player-auth/login/player-login.page').then((m) => m.PlayerLoginPage),
  },
  {
    path: 'player/register',
    loadComponent: () =>
      import('./pages/player-auth/register/player-register.page').then((m) => m.PlayerRegisterPage),
  },
  {
    path: 'admin',
    canActivate: [resetThemeGuard, authGuard],
    loadComponent: () => import('./admin/shell/app-shell').then((m) => m.AppShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'tournaments' },
      {
        path: 'tournaments',
        loadComponent: () =>
          import('./admin/pages/tournaments/tournament-list.page').then(
            (m) => m.TournamentListPage,
          ),
      },
      {
        path: 'tournaments/new',
        loadComponent: () =>
          import('./admin/pages/tournaments/tournament-form.page').then(
            (m) => m.TournamentFormPage,
          ),
      },
      {
        path: 'tournaments/:tournamentId',
        loadComponent: () =>
          import('./admin/pages/tournaments/tournament-form.page').then(
            (m) => m.TournamentFormPage,
          ),
      },
      {
        path: 'tournaments/:tournamentId/teams',
        loadComponent: () =>
          import('./admin/pages/teams/team-list.page').then((m) => m.TeamListPage),
      },
      {
        path: 'tournaments/:tournamentId/referees',
        loadComponent: () =>
          import('./admin/pages/referees/referee-list.page').then((m) => m.RefereeListPage),
      },
      {
        path: 'tournaments/:tournamentId/structure',
        loadComponent: () =>
          import('./admin/pages/structure/structure.page').then((m) => m.StructurePage),
      },
      {
        path: 'tournaments/:tournamentId/schedule',
        loadComponent: () =>
          import('./admin/pages/schedule/schedule.page').then((m) => m.SchedulePage),
      },
      {
        path: 'tournaments/:tournamentId/scores',
        loadComponent: () => import('./admin/pages/scores/scores.page').then((m) => m.ScoresPage),
      },
      {
        path: 'tournaments/:tournamentId/standings',
        loadComponent: () =>
          import('./admin/pages/standings/standings.page').then((m) => m.StandingsPage),
      },
      {
        path: 'tournaments/:tournamentId/registrations',
        loadComponent: () =>
          import('./admin/pages/registrations/registration-list.page').then(
            (m) => m.RegistrationListPage,
          ),
      },
      {
        path: 'tournaments/:tournamentId/publish/success',
        loadComponent: () =>
          import('./admin/pages/tournaments/tournament-publish-success.page').then(
            (m) => m.TournamentPublishSuccessPage,
          ),
      },
      {
        path: 'collaborators',
        loadComponent: () =>
          import('./admin/pages/collaborators/collaborators.page').then((m) => m.CollaboratorsPage),
      },
      {
        path: 'organization/subscription',
        loadComponent: () =>
          import('./admin/pages/subscription/organization-subscription.page').then(
            (m) => m.OrganizationSubscriptionPage,
          ),
      },
      {
        path: 'organization/subscription/success',
        loadComponent: () =>
          import('./admin/pages/subscription/organization-subscription-success.page').then(
            (m) => m.OrganizationSubscriptionSuccessPage,
          ),
      },
    ],
  },
  {
    path: ':slug',
    loadComponent: () => import('./shell/tournament-shell').then((m) => m.TournamentShell),
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'team',
        loadComponent: () =>
          import('./pages/team-search/team-search.page').then((m) => m.TeamSearchPage),
      },
      {
        path: 'team/:teamId',
        loadComponent: () =>
          import('./pages/team-detail/team-detail.page').then((m) => m.TeamDetailPage),
      },
      {
        path: 'standings',
        loadComponent: () =>
          import('./pages/standings/standings.page').then((m) => m.StandingsPage),
      },
      {
        path: 'schedule',
        loadComponent: () => import('./pages/schedule/schedule.page').then((m) => m.SchedulePage),
      },
      {
        path: 'register',
        canActivate: [playerAuthGuard],
        loadComponent: () => import('./pages/register/register.page').then((m) => m.RegisterPage),
      },
      {
        path: 'register/success',
        canActivate: [playerAuthGuard],
        loadComponent: () =>
          import('./pages/register-success/register-success.page').then(
            (m) => m.RegisterSuccessPage,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
