import { Routes } from '@angular/router';
import { authGuard } from './admin/core/auth.guard';
import { resetThemeGuard } from './admin/core/reset-theme.guard';
import { playerAuthGuard } from './core/player-auth.guard';
import { superAdminAuthGuard } from './super-admin/core/super-admin-auth.guard';

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
    path: 'verify-email/:token',
    loadComponent: () =>
      import('./admin/pages/verify-email/verify-email.page').then((m) => m.VerifyEmailPage),
  },
  {
    // Top-level, before the ':slug' catch-all below -- otherwise it would
    // swallow '/contact', '/terms' and '/privacy' as tournament slugs.
    path: 'contact',
    loadComponent: () => import('./pages/contact/contact.page').then((m) => m.ContactPage),
  },
  {
    path: 'terms',
    loadComponent: () => import('./pages/legal/terms.page').then((m) => m.TermsPage),
  },
  {
    path: 'privacy',
    loadComponent: () => import('./pages/legal/privacy.page').then((m) => m.PrivacyPage),
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
    path: 'super-admin/login',
    loadComponent: () =>
      import('./super-admin/pages/login/super-admin-login.page').then((m) => m.SuperAdminLoginPage),
  },
  {
    // Sibling to 'admin', not nested under it: AppShell is hard-wired to
    // authService.organizations()[0] and a single-organization submenu --
    // this area is deliberately cross-organization, so it gets its own
    // shell and its own guard (superAdminAuthGuard, a separate
    // SuperAdminAccount session -- see super-admin/core).
    path: 'super-admin',
    canActivate: [superAdminAuthGuard],
    loadComponent: () =>
      import('./super-admin/shell/super-admin-shell').then((m) => m.SuperAdminShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./super-admin/pages/dashboard/super-admin-dashboard.page').then(
            (m) => m.SuperAdminDashboardPage,
          ),
      },
      {
        path: 'organizations',
        loadComponent: () =>
          import('./super-admin/pages/organizations/super-admin-organizations.page').then(
            (m) => m.SuperAdminOrganizationsPage,
          ),
      },
      {
        path: 'organizations/:organizationId',
        loadComponent: () =>
          import('./super-admin/pages/organizations/super-admin-organization-detail.page').then(
            (m) => m.SuperAdminOrganizationDetailPage,
          ),
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./super-admin/pages/users/super-admin-users.page').then(
            (m) => m.SuperAdminUsersPage,
          ),
      },
      {
        path: 'tournaments',
        loadComponent: () =>
          import('./super-admin/pages/tournaments/super-admin-tournaments.page').then(
            (m) => m.SuperAdminTournamentsPage,
          ),
      },
      {
        path: 'tournaments/:tournamentId',
        loadComponent: () =>
          import('./super-admin/pages/tournaments/super-admin-tournament-detail.page').then(
            (m) => m.SuperAdminTournamentDetailPage,
          ),
      },
      {
        path: 'payments',
        loadComponent: () =>
          import('./super-admin/pages/payments/super-admin-payments.page').then(
            (m) => m.SuperAdminPaymentsPage,
          ),
      },
      {
        path: 'account',
        loadComponent: () =>
          import('./super-admin/pages/account/super-admin-account.page').then(
            (m) => m.SuperAdminAccountPage,
          ),
      },
    ],
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
        path: 'tournaments/:tournamentId/export',
        loadComponent: () =>
          import('./admin/pages/print-export/print-export.page').then((m) => m.PrintExportPage),
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
        path: 'account',
        loadComponent: () =>
          import('./admin/pages/account/account.page').then((m) => m.AccountPage),
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
