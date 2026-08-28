import { expect, test } from '@playwright/test';
import {
  createBarePhase,
  createCategory,
  createTournament,
  firstSportId,
  getTournamentStatus,
  setupOrganizer,
} from './support/api-setup';
import { loginWeb } from './support/ui';

// "publie -> dépublie -> ajoute/retire des équipes entre-temps -> republie"
// (plan file's test plan), verifying status at each step both through the
// UI's own lifecycle button label and independently through the API.
test('cycle publier / dépublier / republier, avec des équipes ajoutées et retirées entre-temps', async ({
  page,
  request,
}) => {
  const session = await setupOrganizer(request, 'cycle');
  const sportId = await firstSportId(request, session);
  const tournamentId = await createTournament(request, session, 'Cycle publication', sportId);
  const categoryId = await createCategory(request, session, tournamentId);
  await createBarePhase(request, session, tournamentId, categoryId);

  await loginWeb(page, session);
  await page.goto(`/admin/tournaments/${tournamentId}`);

  // 1. Publish (free tier -- see team-capacity.web.spec.ts's own note on the
  // paid-tier boundary; this tournament has 0 teams, well under it).
  await page.getByRole('button', { name: 'Publier', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dépublier', exact: true })).toBeVisible({ timeout: 10_000 });
  expect(await getTournamentStatus(request, session, tournamentId)).toBe('PUBLISHED');

  // 2. Unpublish.
  await page.getByRole('button', { name: 'Dépublier', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Publier', exact: true })).toBeVisible({ timeout: 10_000 });
  expect(await getTournamentStatus(request, session, tournamentId)).toBe('UNPUBLISHED');

  // 3. While unpublished: add a team, then remove it.
  await page.goto(`/admin/tournaments/${tournamentId}/teams`);
  await page.getByLabel("Nom de l'équipe").fill('Équipe temporaire');
  await page.getByRole('button', { name: "Ajouter l'équipe" }).click();
  const row = page.locator('tr.team-list-page__row', { hasText: 'Équipe temporaire' });
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Supprimer' }).click();
  await row.getByRole('button', { name: 'Confirmer la suppression' }).click();
  await expect(row).toHaveCount(0);

  // 4. Republish -- the existing publish() endpoint already handles this
  // without a conflict (fixed earlier this session, see git history).
  await page.goto(`/admin/tournaments/${tournamentId}`);
  await page.getByRole('button', { name: 'Publier', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Dépublier', exact: true })).toBeVisible({ timeout: 10_000 });
  expect(await getTournamentStatus(request, session, tournamentId)).toBe('PUBLISHED');
});
