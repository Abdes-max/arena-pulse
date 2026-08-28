import { expect, test } from '@playwright/test';
import {
  createCategory,
  createStructurePreset,
  createTeams,
  createTournament,
  createVenueAndField,
  firstSportId,
  generateAllBracketMatches,
  generateSchedule,
  getStandings,
  listPhases,
  setupOrganizer,
  type StructureFormat,
} from './support/api-setup';
import {
  loginMobile,
  openTournamentCard,
  playAllScoresToCompletion,
  selectAllPhasesFilter,
  waitForPageLoaded,
} from './support/ui';

// Mobile counterpart of tournament-lifecycle.web.spec.ts (PR 4's own native
// Scores/Standings pages, apps/mobile/src/app/organizer/pages/{scores,
// standings}) -- same 3 structures, same "play every match to completion
// through the real UI" verification. Navigates via openTournamentCard (SPA
// routing) rather than `page.goto`, same reason as the other mobile specs
// -- see that helper's own comment.
const STRUCTURES: { format: StructureFormat; label: string; teamCount: number; poolCount?: number }[] = [
  { format: 'POOLS_ONLY', label: 'Poules uniquement', teamCount: 6, poolCount: 2 },
  { format: 'POOLS_AND_KNOCKOUT', label: 'Poules puis élimination directe', teamCount: 8, poolCount: 2 },
  { format: 'KNOCKOUT_ONLY', label: 'Élimination directe simple', teamCount: 8 },
];

for (const structure of STRUCTURES) {
  test(`${structure.label} (mobile) : joué jusqu'au bout, classement final correct`, async ({
    page,
    request,
  }) => {
    const session = await setupOrganizer(request, `mlife-${structure.format.toLowerCase()}`);
    const sportId = await firstSportId(request, session);
    const name = `Cycle mobile -- ${structure.label}`;
    const tournamentId = await createTournament(request, session, name, sportId);
    const categoryId = await createCategory(request, session, tournamentId);
    await createTeams(request, session, tournamentId, categoryId, structure.teamCount);
    await createStructurePreset(request, session, tournamentId, categoryId, {
      format: structure.format,
      teamCount: structure.teamCount,
      poolCount: structure.poolCount,
    });

    const fieldId = await createVenueAndField(request, session, tournamentId);
    const phases = await listPhases(request, session, tournamentId, categoryId);
    const groupPhase = phases.find((phase) => phase.type === 'GROUP_STAGE' && !phase.isSeedPhase);
    if (groupPhase) {
      await generateSchedule(
        request,
        session,
        tournamentId,
        groupPhase.id,
        fieldId,
        '2026-09-05T09:00:00.000Z',
      );
    }
    if (structure.format !== 'POOLS_ONLY') {
      // See tournament-lifecycle.web.spec.ts's own comment -- a knockout
      // bracket's Round-1 matches are never created on their own.
      await generateAllBracketMatches(
        request,
        session,
        tournamentId,
        categoryId,
        fieldId,
        groupPhase ? undefined : '2026-09-05T09:00:00.000Z',
      );
    }

    await loginMobile(page, session);
    await openTournamentCard(page, name, 'scores');
    await waitForPageLoaded(page);
    await selectAllPhasesFilter(page);

    await playAllScoresToCompletion(page);

    if (structure.format === 'POOLS_ONLY') {
      const finalPhases = await listPhases(request, session, tournamentId, categoryId);
      const finalGroupPhase = finalPhases.find(
        (phase) => phase.type === 'GROUP_STAGE' && !phase.isSeedPhase,
      )!;
      for (const group of finalGroupPhase.groups) {
        const standings = await getStandings(request, session, tournamentId, group.id);
        expect(standings.isComplete, `pool ${group.name} should be complete`).toBe(true);
      }
    } else {
      // Back to the list (SPA nav via the Scores page's own "Annuler"/back
      // button) then into Standings from there -- never `page.goto`.
      await page.getByRole('button', { name: 'Annuler' }).click();
      await openTournamentCard(page, name, 'standings');
      await page.getByLabel('Phase').selectOption('final');
      await expect(page.locator('.standings-page__podium-step--1')).toBeVisible({
        timeout: 10_000,
      });
    }
  });
}
