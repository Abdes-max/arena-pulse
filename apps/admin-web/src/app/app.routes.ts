import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'collaborators' },
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
    path: 'collaborators',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/collaborators/collaborators.page').then((m) => m.CollaboratorsPage),
  },
  { path: '**', redirectTo: 'login' },
];
