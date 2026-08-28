import { expect, test } from '@playwright/test';
import {
  createCategory,
  createStructurePreset,
  createTeams,
  createTournament,
  createVenueAndField,
  firstSportId,
  generateSchedule,
  getTournamentStatus,
  listTeams,
  setupOrganizer,
  type OrganizerSession,
} from './support/api-setup';
import { loginWeb } from './support/ui';

// "8 équipes -> publie -> ajoute une équipe" and the same at "48 équipes"
// (see the plan file's test plan) -- observes real behavior rather than
// assuming it, since the free/paid publication tier boundary
// (TOURNAMENT_PUBLICATION_TIER_FREE_MAX_TEAMS=8, apps/api/.env) means these
// two scenarios are NOT the same shape: 8 teams publishes immediately for
// free, 48 crosses into the paid tier and gets redirected to a Stripe
// Checkout instead of publishing outright. Completing a real/test Stripe
// payment is deliberately NOT automated here (see this file's own second
// test) -- that belongs to the API's own Stripe-focused e2e coverage
// (apps/api/test/tournament-publication.e2e-spec.ts), not a broad UI
// regression suite; this test verifies the checkout hand-off happens and
// stops there.
async function setupTournamentWithTeams(
  request: import('@playwright/test').APIRequestContext,
  session: OrganizerSession,
  name: string,
  teamCount: number,
  poolCount: number,
): Promise<{ tournamentId: string; categoryId: string }> {
  const sportId = await firstSportId(request, session);
  const tournamentId = await createTournament(request, session, name, sportId);
  const categoryId = await createCategory(request, session, tournamentId);
  await createTeams(request, session, tournamentId, categoryId, teamCount);
  const preset = await createStructurePreset(request, session, tournamentId, categoryId, {
    format: 'POOLS_AND_KNOCKOUT',
    teamCount,
    poolCount,
  });
  const fieldId = await createVenueAndField(request, session, tournamentId);
  await generateSchedule(
    request,
    session,
    tournamentId,
    preset.groupPhaseId,
    fieldId,
    '2026-09-05T09:00:00.000Z',
  );
  return { tournamentId, categoryId };
}

test('8 équipes : publication gratuite immédiate, puis ajout d’une équipe après publication', async ({
  page,
  request,
}) => {
  const session = await setupOrganizer(request, 'cap8');
  const { tournamentId, categoryId } = await setupTournamentWithTeams(
    request,
    session,
    'Capacité 8 équipes',
    8,
    2,
  );

  await loginWeb(page, session);
  await page.goto(`/admin/tournaments/${tournamentId}`);
  await page.getByRole('button', { name: 'Publier', exact: true }).click();

  // Free tier (<= 8 teams): publish() resolves the tournament directly, no
  // Stripe redirect -- the button flips to "Dépublier" in place.
  await expect(page.getByRole('button', { name: 'Dépublier', exact: true })).toBeVisible({ timeout: 10_000 });
  expect(await getTournamentStatus(request, session, tournamentId)).toBe('PUBLISHED');

  await page.goto(`/admin/tournaments/${tournamentId}/teams`);
  await page.getByLabel("Nom de l'équipe").fill('Équipe 9');
  await page.getByRole('button', { name: "Ajouter l'équipe" }).click();

  // Real observed behavior (NOT the naive assumption that any team addition
  // just succeeds): TournamentsService.assertTeamAdditionAllowed blocks
  // adding a team past the free tier on an ALREADY-PUBLISHED tournament --
  // this one is exactly at the 8-team free cap, so a 9th team crosses into
  // the paid tier and the team-list page shows its tier-upsell modal
  // instead of adding the team.
  await expect(page.locator('.team-list-page__tier-modal-dialog')).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText('Équipe 9')).not.toBeVisible();
  expect((await listTeams(request, session, tournamentId, categoryId)).length).toBe(8);
  expect(await getTournamentStatus(request, session, tournamentId)).toBe('PUBLISHED');
});

test('48 équipes : la publication franchit le palier payant (redirection Stripe Checkout, pas de publication immédiate)', async ({
  page,
  request,
}) => {
  const session = await setupOrganizer(request, 'cap48');
  const { tournamentId } = await setupTournamentWithTeams(
    request,
    session,
    'Capacité 48 équipes',
    48,
    8,
  );

  await loginWeb(page, session);
  await page.goto(`/admin/tournaments/${tournamentId}`);
  await page.getByRole('button', { name: 'Publier', exact: true }).click();

  // Beyond the free tier, publish() returns {status:'PENDING_PAYMENT',
  // checkoutUrl} and the app does a full-page redirect (window.location.href)
  // to Stripe's hosted Checkout -- observed here as a navigation away from
  // this app's own origin, not a completed publication.
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15_000 });
  expect(await getTournamentStatus(request, session, tournamentId)).toBe('DRAFT');

  // Adding a team while the tournament is still unpublished (payment never
  // completed) -- the ordinary, always-available team-management flow,
  // unaffected by the pending checkout.
  await page.goto(`/admin/tournaments/${tournamentId}/teams`);
  await page.getByLabel("Nom de l'équipe").fill('Équipe 49');
  await page.getByRole('button', { name: "Ajouter l'équipe" }).click();
  await expect(page.getByText('Équipe 49')).toBeVisible();
  expect(await getTournamentStatus(request, session, tournamentId)).toBe('DRAFT');
});
