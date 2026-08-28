import { expect, test } from '@playwright/test';
import {
  createBarePhase,
  createCategory,
  createTournament,
  firstSportId,
  getTournamentStatus,
  setupOrganizer,
} from './support/api-setup';
import { loginMobile, openTournamentCard } from './support/ui';

// Mobile counterpart of publish-cycle.web.spec.ts, through the wizard's
// edit-mode Publication/Équipes steps (PR #195/PR 4). Stays within a single
// wizard visit throughout (rail clicks only, never `page.goto` again after
// login) -- see openTournamentCard's own comment for why.
test('cycle publier / dépublier / republier (mobile), avec des équipes ajoutées et retirées entre-temps', async ({
  page,
  request,
}) => {
  const session = await setupOrganizer(request, 'mcycle');
  const sportId = await firstSportId(request, session);
  const name = 'Cycle mobile';
  const tournamentId = await createTournament(request, session, name, sportId);
  const categoryId = await createCategory(request, session, tournamentId);
  await createBarePhase(request, session, tournamentId, categoryId);

  await loginMobile(page, session);
  await openTournamentCard(page, name);

  const rail = page.locator('.wizard-page__rail-step');

  // 1. Publish.
  await rail.nth(4).click();
  await page.locator('.wizard-page__footer-next').click();
  await expect(page.getByText('Tournoi publié !')).toBeVisible({ timeout: 10_000 });
  expect(await getTournamentStatus(request, session, tournamentId)).toBe('PUBLISHED');

  // Back to the wizard for the rest -- the 'done' confirmation screen has
  // its own "Retour à Mes tournois" button (SPA nav) rather than a rail.
  await page.getByRole('button', { name: 'Retour à Mes tournois' }).click();
  await openTournamentCard(page, name);

  // 2. Unpublish -- edit mode's footer button relabels to "Dépublier" and
  // stays on step 5 instead of routing to the 'done' confirmation screen
  // (that copy assumes a first publish, see tournament-wizard.page.ts).
  await rail.nth(4).click();
  await expect(page.getByRole('button', { name: 'Dépublier', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dépublier', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Republier', exact: true })).toBeVisible({
    timeout: 10_000,
  });
  expect(await getTournamentStatus(request, session, tournamentId)).toBe('UNPUBLISHED');

  // 3. While unpublished: add a team, then remove it (edit mode's
  // immediate-edit team step -- each action is its own API call).
  await rail.nth(1).click();
  await page.getByPlaceholder("Nom de l'équipe").fill('Équipe temporaire');
  await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
  const row = page.locator('.wizard-page__teamrow', { hasText: 'Équipe temporaire' });
  await expect(row).toBeVisible();
  await row.getByRole('button').click(); // the row's single "remove" (×) button
  await expect(row).toHaveCount(0);

  // 4. Republish.
  await rail.nth(4).click();
  await page.getByRole('button', { name: 'Republier', exact: true }).click();
  await expect(page.getByText('Tournoi publié !')).toBeVisible({ timeout: 10_000 });
  expect(await getTournamentStatus(request, session, tournamentId)).toBe('PUBLISHED');
});
