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
  loginWeb,
  playAllScoresToCompletion,
  selectAllPhasesFilter,
  waitForPageLoaded,
} from './support/ui';

// "3 tournois, un par structure, joués jusqu'au bout" (see the plan file's
// test plan) -- creates one tournament per format via the API (teams,
// structure, calendar, knockout bracket matches), then plays every match to
// completion through the REAL Scores page UI (playAllScoresToCompletion),
// and verifies the final standings/bracket reflect it, all on admin web.
const STRUCTURES: { format: StructureFormat; label: string; teamCount: number; poolCount?: number }[] = [
  { format: 'POOLS_ONLY', label: 'Poules uniquement', teamCount: 6, poolCount: 2 },
  { format: 'POOLS_AND_KNOCKOUT', label: 'Poules puis élimination directe', teamCount: 8, poolCount: 2 },
  { format: 'KNOCKOUT_ONLY', label: 'Élimination directe simple', teamCount: 8 },
];

for (const structure of STRUCTURES) {
  test(`${structure.label} : joué jusqu'au bout, classement final correct`, async ({ page, request }) => {
    const session = await setupOrganizer(request, `life-${structure.format.toLowerCase()}`);
    const sportId = await firstSportId(request, session);
    const tournamentId = await createTournament(
      request,
      session,
      `Cycle complet -- ${structure.label}`,
      sportId,
    );
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
      // A knockout bracket's Round-1 matches are never created on their
      // own (BracketsService.tryResolveFirstRound only ever fills in
      // opponents on placeholder rows that already exist, see its own
      // comment) -- this is the separate "Générer tous les matchs à
      // élimination directe" action admin web's Calendrier page offers.
      // KNOCKOUT_ONLY has no real pool schedule to compute a start time
      // from (its "pool" phase is a fictitious seed phase), so
      // startDateTime is required there and only there.
      await generateAllBracketMatches(
        request,
        session,
        tournamentId,
        categoryId,
        fieldId,
        groupPhase ? undefined : '2026-09-05T09:00:00.000Z',
      );
    }

    await loginWeb(page, session);
    await page.goto(`/admin/tournaments/${tournamentId}/scores`);
    await waitForPageLoaded(page);
    await selectAllPhasesFilter(page);

    await playAllScoresToCompletion(page);

    // Final verification split by structure: POOLS_ONLY has no bracket, so
    // "played to completion" means the pool standings themselves settle
    // (isComplete); the other two formats settle a knockout bracket, so the
    // final ranking view becomes non-empty (a winner exists).
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
      await page.goto(`/admin/tournaments/${tournamentId}/standings`);
      await page.getByLabel('Phase').selectOption('final');
      await expect(page.locator('.standings-page__podium-step--1')).toBeVisible({
        timeout: 10_000,
      });
    }
  });
}
