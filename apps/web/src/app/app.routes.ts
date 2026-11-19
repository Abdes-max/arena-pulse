import { Routes } from '@angular/router';
import { authGuard } from './admin/core/auth.guard';
import { guestGuard } from './admin/core/guest.guard';
import { resetThemeGuard } from './admin/core/reset-theme.guard';
import { playerAuthGuard } from './core/player-auth.guard';
import { superAdminAuthGuard } from './super-admin/core/super-admin-auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    data: { meta: { title: 'seo.landing.title', description: 'seo.landing.description' } },
    loadComponent: () => import('./pages/landing/landing.page').then((m) => m.LandingPage),
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./admin/pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./admin/pages/register/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./admin/pages/forgot-password/forgot-password.page').then(
        (m) => m.ForgotPasswordPage,
      ),
  },
  {
    path: 'reset-password/:token',
    loadComponent: () =>
      import('./admin/pages/reset-password/reset-password.page').then((m) => m.ResetPasswordPage),
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
    data: { meta: { title: 'seo.contact.title', description: 'seo.contact.description' } },
    loadComponent: () => import('./pages/contact/contact.page').then((m) => m.ContactPage),
  },
  {
    path: 'terms',
    data: { meta: { title: 'seo.terms.title', description: 'seo.terms.description' } },
    loadComponent: () => import('./pages/legal/terms.page').then((m) => m.TermsPage),
  },
  {
    path: 'privacy',
    data: { meta: { title: 'seo.privacy.title', description: 'seo.privacy.description' } },
    loadComponent: () => import('./pages/legal/privacy.page').then((m) => m.PrivacyPage),
  },
  {
    // English address some links used: same search page (query params kept).
    path: 'discover',
    redirectTo: 'decouvrir',
  },
  {
    path: 'decouvrir',
    data: { meta: { title: 'seo.discover.title', description: 'seo.discover.description' } },
    loadComponent: () => import('./pages/discover/discover.page').then((m) => m.DiscoverPage),
  },
  // Team manager's space (PlayerAccount): French addresses, like /decouvrir.
  // Declared before the ':slug' catch-all below.
  {
    path: 'espace-responsable',
    pathMatch: 'full',
    canActivate: [playerAuthGuard],
    loadComponent: () =>
      import('./pages/my-registrations/my-registrations.page').then((m) => m.MyRegistrationsPage),
  },
  {
    path: 'espace-responsable/connexion',
    loadComponent: () =>
      import('./pages/player-auth/login/player-login.page').then((m) => m.PlayerLoginPage),
  },
  {
    path: 'espace-responsable/creer-un-compte',
    loadComponent: () =>
      import('./pages/player-auth/register/player-register.page').then((m) => m.PlayerRegisterPage),
  },
  // Former English addresses (links already sent, bookmarks): query params
  // (returnUrl) carry over through the redirect.
  { path: 'player/registrations', redirectTo: 'espace-responsable' },
  { path: 'player/login', redirectTo: 'espace-responsable/connexion' },
  { path: 'player/register', redirectTo: 'espace-responsable/creer-un-compte' },
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
        path: 'tournaments/new-plateau',
        loadComponent: () =>
          import('./admin/pages/tournaments/quick-plateau.page').then((m) => m.QuickPlateauPage),
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
        // Referees now live at the bottom of the Teams page.
        path: 'tournaments/:tournamentId/referees',
        redirectTo: 'tournaments/:tournamentId/teams',
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
        // The day-of page (by rotation) is the one Scores page now.
        path: 'tournaments/:tournamentId/scores',
        loadComponent: () => import('./admin/pages/live/live.page').then((m) => m.LivePage),
      },
      {
        path: 'tournaments/:tournamentId/standings',
        loadComponent: () =>
          import('./admin/pages/standings/standings.page').then((m) => m.StandingsPage),
      },
      {
        path: 'tournaments/:tournamentId/stats',
        loadComponent: () =>
          import('./admin/pages/stats/tournament-stats.page').then((m) => m.TournamentStatsPage),
      },
      {
        path: 'tournaments/:tournamentId/export',
        loadComponent: () =>
          import('./admin/pages/print-export/print-export.page').then((m) => m.PrintExportPage),
      },
      {
        // Now a block of the Équipes tab; old links (e-mails...) still land there.
        path: 'tournaments/:tournamentId/registrations',
        redirectTo: 'tournaments/:tournamentId/teams',
      },
      {
        path: 'tournaments/:tournamentId/live',
        redirectTo: 'tournaments/:tournamentId/scores',
      },
      {
        path: 'tournaments/:tournamentId/review',
        loadComponent: () =>
          import('./admin/pages/review/tournament-review.page').then((m) => m.TournamentReviewPage),
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
    // Before ':slug' so it renders full screen, outside TournamentShell.
    path: ':slug/tv',
    loadComponent: () => import('./pages/tv/tv.page').then((m) => m.TvPage),
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
        path: 'wrapped',
        loadComponent: () => import('./pages/wrapped/wrapped.page').then((m) => m.WrappedPage),
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
  {
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];
