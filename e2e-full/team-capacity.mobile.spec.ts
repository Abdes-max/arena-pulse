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
import { loginMobile, openTournamentCard } from './support/ui';

// Mobile counterpart of team-capacity.web.spec.ts -- same two scenarios (8
// teams: free immediate publish; 48 teams: crosses into the paid tier), run
// through the native wizard's edit mode (PR #195) instead of admin web.
// Same deliberate scope note as the web spec: completing a real/test Stripe
// payment is not automated here. Stays within one wizard visit throughout
// (rail clicks / the 'done' screen's own back button only, never
// `page.goto` again after login) -- see openTournamentCard's own comment.
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
  const session = await setupOrganizer(request, 'mcap8');
  const name = 'Capacité mobile 8';
  const { tournamentId, categoryId } = await setupTournamentWithTeams(request, session, name, 8, 2);

  await loginMobile(page, session);
  await openTournamentCard(page, name);
  await page.locator('.wizard-page__rail-step').nth(4).click();
  await page.locator('.wizard-page__footer-next').click();

  await expect(
    page.getByText('Tournoi publié !').or(page.getByText('Finalisez le paiement')),
  ).toBeVisible({ timeout: 10_000 });
  expect(await getTournamentStatus(request, session, tournamentId)).toBe('PUBLISHED');

  await page.getByRole('button', { name: 'Retour à Mes tournois' }).click();
  await openTournamentCard(page, name);
  await page.locator('.wizard-page__rail-step').nth(1).click();
  await page.getByPlaceholder("Nom de l'équipe").fill('Équipe 9');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();

  // Real observed behavior -- same backend guard as the web spec
  // (TournamentsService.assertTeamAdditionAllowed, this tournament is
  // exactly at the 8-team free cap), but the mobile wizard has no
  // tier-upsell modal of its own yet: it just surfaces the generic
  // "Impossible d'ajouter cette équipe, réessayez." error (organizer.
  // wizard.teams.errorAdd) with no indication a paid upgrade would fix it
  // -- a real UX gap relative to admin web, worth flagging.
  await expect(page.getByText("Impossible d'ajouter cette équipe, réessayez.")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText('Équipe 9')).not.toBeVisible();
  expect((await listTeams(request, session, tournamentId, categoryId)).length).toBe(8);
  expect(await getTournamentStatus(request, session, tournamentId)).toBe('PUBLISHED');
});

test('48 équipes : la publication franchit le palier payant (pas de publication immédiate)', async ({
  page,
  request,
}) => {
  const session = await setupOrganizer(request, 'mcap48');
  const name = 'Capacité mobile 48';
  const { tournamentId } = await setupTournamentWithTeams(request, session, name, 48, 8);

  await loginMobile(page, session);
  await openTournamentCard(page, name);
  await page.locator('.wizard-page__rail-step').nth(4).click();
  await page.locator('.wizard-page__footer-next').click();

  await expect(
    page.getByText('Tournoi publié !').or(page.getByText('Finalisez le paiement')),
  ).toBeVisible({ timeout: 10_000 });
  expect(await getTournamentStatus(request, session, tournamentId)).toBe('DRAFT');

  await page.getByRole('button', { name: 'Retour à Mes tournois' }).click();
  await openTournamentCard(page, name);
  await page.locator('.wizard-page__rail-step').nth(1).click();
  await page.getByPlaceholder("Nom de l'équipe").fill('Équipe 49');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  await expect(page.getByText('Équipe 49')).toBeVisible();
  expect(await getTournamentStatus(request, session, tournamentId)).toBe('DRAFT');
});
