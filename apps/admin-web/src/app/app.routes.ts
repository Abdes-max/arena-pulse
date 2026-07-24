import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tournaments' },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    loadComponent: () => import('./pages/register/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'accept-invitation/:token',
    loadComponent: () =>
      import('./pages/accept-invitation/accept-invitation.page').then(
        (m) => m.AcceptInvitationPage,
      ),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./shell/app-shell').then((m) => m.AppShell),
    children: [
      {
        path: 'tournaments',
        loadComponent: () =>
          import('./pages/tournaments/tournament-list.page').then((m) => m.TournamentListPage),
      },
      {
        path: 'tournaments/new',
        loadComponent: () =>
          import('./pages/tournaments/tournament-form.page').then((m) => m.TournamentFormPage),
      },
      {
        path: 'tournaments/:tournamentId',
        loadComponent: () =>
          import('./pages/tournaments/tournament-form.page').then((m) => m.TournamentFormPage),
      },
      {
        path: 'tournaments/:tournamentId/teams',
        loadComponent: () => import('./pages/teams/team-list.page').then((m) => m.TeamListPage),
      },
      {
        path: 'tournaments/:tournamentId/referees',
        loadComponent: () =>
          import('./pages/referees/referee-list.page').then((m) => m.RefereeListPage),
      },
      {
        path: 'tournaments/:tournamentId/structure',
        loadComponent: () =>
          import('./pages/structure/structure.page').then((m) => m.StructurePage),
      },
      {
        path: 'tournaments/:tournamentId/schedule',
        loadComponent: () => import('./pages/schedule/schedule.page').then((m) => m.SchedulePage),
      },
      {
        path: 'tournaments/:tournamentId/scores',
        loadComponent: () => import('./pages/scores/scores.page').then((m) => m.ScoresPage),
      },
      {
        path: 'collaborators',
        loadComponent: () =>
          import('./pages/collaborators/collaborators.page').then((m) => m.CollaboratorsPage),
      },
    ],
  },
  { path: '**', redirectTo: 'login' },
];
