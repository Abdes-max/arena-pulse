import { expect, type Locator, type Page } from '@playwright/test';
import type { OrganizerSession } from './api-setup';

/** Logs into the admin web app (apps/web/src/app/admin) with an already-set-up organizer session (see api-setup.ts's setupOrganizer). */
export async function loginWeb(page: Page, session: OrganizerSession): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(session.email);
  await page.getByLabel('Mot de passe').fill(session.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL(/\/admin\//);
}

/** Logs into the native mobile organizer app (apps/mobile/src/app/organizer) with an already-set-up organizer session. */
export async function loginMobile(page: Page, session: OrganizerSession): Promise<void> {
  await page.goto('/organizer/login');
  await page.getByLabel('Email').fill(session.email);
  await page.getByLabel('Mot de passe').fill(session.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL(/\/organizer\/tournaments/);
}

/**
 * Opens a tournament card from the mobile "Mes tournois" list (organizer's
 * session token lives only in memory, not localStorage -- a `page.goto`
 * after login is a full reload that loses it, since the refresh_token
 * cookie's silent-refresh doesn't survive local dev's cross-origin
 * http://localhost:4400 -> http://localhost:3000 without HTTPS). Every
 * mobile spec must navigate this way (or via the in-app "Annuler"/back
 * button, never `page.goto`) after the one `page.goto('/organizer/login')`
 * inside loginMobile above.
 */
export async function openTournamentCard(
  page: Page,
  tournamentName: string,
  action?: 'scores' | 'standings',
): Promise<void> {
  await page.waitForURL(/\/organizer\/tournaments$/);
  const card = page.locator('.tcard', { hasText: tournamentName });
  if (action === 'scores') {
    await card.getByRole('button', { name: 'Scores', exact: true }).click();
  } else if (action === 'standings') {
    await card.getByRole('button', { name: 'Classement', exact: true }).click();
  } else {
    await card.click();
  }
}

/**
 * Drives a Scores page (admin web's or mobile's -- both share the same
 * `.scores-page__match` row markup and French copy by deliberate design,
 * see apps/mobile's scores.page.ts own top comment) to completion: enters a
 * fixed 2-1 result (never a draw, so no penalty-shootout branch is ever
 * needed) for every scoreable match, validates it, and repeats from a fresh
 * DOM query each time since validating a knockout round's last match
 * resolves the next round's real opponents server-side (see
 * ScoresPage.validateScore's own comment) -- previously "pending
 * opponents" rows can turn into scoreable ones between iterations. Assumes
 * the page's phase filter already shows every match that needs playing
 * (the "Tous" option when both a pool and a knockout phase exist).
 */
/**
 * Dispatches a real click via the DOM's own .click() instead of Playwright's
 * normal mouse-event click -- Playwright's click first waits for the
 * element to be "stable" (unmoving across two animation frames), but the
 * Scores page's own Valider button turns into a "Validé" label the instant
 * it's clicked (score gets validated near-instantly), so the click's own
 * effect can look like "the element is disappearing/unstable" and
 * Playwright times out waiting for stability that will never come *because*
 * the click already landed. el.click() has no such precondition and fires
 * immediately, same fix as this session's own manual browser debugging hit
 * for the same class of fast-reacting-SPA symptom.
 */
async function clickResilient(locator: Locator): Promise<void> {
  await locator.evaluate((el) => (el as HTMLElement).click());
}

/**
 * Deterministic score for a fixture: the lower-numbered team ("Équipe 3"
 * beats "Équipe 7") always wins 3-0, never a draw. A fixed "home always
 * wins 2-1" pattern (this file's first attempt) creates real 3-way scoring
 * ties in a >2-team round-robin pool (an intransitive cycle from
 * alternating home advantage) -- true app behavior then correctly refuses
 * to seed the knockout bracket until an organizer resolves the tie by hand
 * (Standings page), which is real, working, and already covered by PR 4's
 * own manual verification, but isn't what a "play it out" test is after.
 * A strict total order by team number rules out that whole class of tie.
 */
function deterministicScore(homeName: string, awayName: string): [number, number] {
  const homeNumber = Number(/\d+/.exec(homeName)?.[0] ?? NaN);
  const awayNumber = Number(/\d+/.exec(awayName)?.[0] ?? NaN);
  const homeWins =
    Number.isNaN(homeNumber) || Number.isNaN(awayNumber)
      ? homeName.localeCompare(awayName) < 0
      : homeNumber < awayNumber;
  return homeWins ? [3, 0] : [0, 3];
}

/**
 * Waits out the Scores/Standings page's own "Chargement…" placeholder
 * (loading()) after navigation, before touching the phase-filter <select>
 * or reading its options -- selecting a filter (e.g. the "Tous" option)
 * before this resolves silently no-ops (the option doesn't exist in the
 * DOM yet), leaving the default GROUP_STAGE-only filter in place with no
 * error raised. Found the hard way: an entire POOLS_AND_KNOCKOUT
 * playthrough that only ever played pool matches through the UI, never
 * the knockout bracket, because the "Tous" filter was selected a beat too
 * early on every run.
 */
export async function waitForPageLoaded(page: Page): Promise<void> {
  await expect(page.getByText('Chargement…')).toHaveCount(0, { timeout: 15_000 });
}

/**
 * Switches the Scores page's phase filter to "Tous" (both pool and
 * knockout matches together), if that option exists (it doesn't for a
 * pure POOLS_ONLY structure). Sets the underlying <select>'s value
 * directly + dispatches a real 'change' event rather than using
 * Playwright's `selectOption()` -- ap-select (libs/design-system) binds
 * each <option>'s value via Angular's `[value]` property binding, which
 * doesn't reliably reflect back as a literal HTML attribute, and
 * Playwright's own option/value introspection (`option[value=...]`
 * selectors, `getByRole('option')`) was observed to intermittently miss
 * options that unquestionably exist and are selectable -- found the hard
 * way chasing a POOLS_AND_KNOCKOUT playthrough that silently never
 * switched off the GROUP_STAGE-only default filter. `el.value = ...` plus
 * a native 'change' event sidesteps all of that, landing on
 * Select.handleChange() the same way a real user's click would.
 * Also waits a beat afterwards: unlike the initial page load, switching
 * this filter doesn't toggle the "Chargement…" placeholder
 * (loadMatches()/loadStandingRules() run without touching `loading()`),
 * so the reload it triggers needs an explicit grace period before the
 * caller starts reading match state off the page.
 */
export async function selectAllPhasesFilter(page: Page): Promise<void> {
  const phaseSelect = page.getByLabel('Phase');
  const hasAllOption = await phaseSelect.evaluate(
    (el: HTMLSelectElement) => Array.from(el.options).some((o) => o.value === 'ALL'),
  );
  if (!hasAllOption) {
    return;
  }
  await phaseSelect.evaluate((el: HTMLSelectElement) => {
    el.value = 'ALL';
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(500);
}

export async function playAllScoresToCompletion(page: Page, maxIterations = 400): Promise<void> {
  // Without this, the very first loop iteration below can race the page's
  // own initial load, see zero rows, conclude "nothing left to score" and
  // return immediately having done nothing (found the hard way: a
  // POOLS_ONLY playthrough that silently scored 0 of 6 matches).
  await waitForPageLoaded(page);

  let consecutiveEmptyPasses = 0;
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const rows = page.locator('.scores-page__match');
    const count = await rows.count();
    let handledOne = false;

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const saveButton = row.getByRole('button', { name: 'Enregistrer' });
      if ((await saveButton.count()) === 0) {
        continue; // pending opponents or forfeited -- nothing to score yet
      }
      const alreadyValidated = (await row.getByText('Validé', { exact: true }).count()) > 0;
      if (alreadyValidated) {
        continue;
      }
      const inputs = row.locator('input[type="number"]');
      if ((await inputs.count()) < 2) {
        continue;
      }
      if ((await inputs.nth(0).inputValue()) === '') {
        // Team names identify this row by content rather than position --
        // saving triggers replaceMatch(updated) (a new array reference),
        // which can make Angular recreate this row's DOM node even with
        // `track match.id`; re-deriving `row` by nth(i) afterwards then
        // sometimes chases a detached/stale element ("element was detached
        // from the DOM, retrying" -- found the hard way). Re-querying by
        // team-name text is stable across that re-render.
        const teamNames = await row.locator('.scores-page__team-name').allTextContents();
        const [homeScore, awayScore] =
          teamNames.length >= 2 ? deterministicScore(teamNames[0], teamNames[1]) : [2, 1];
        await inputs.nth(0).fill(String(homeScore));
        await inputs.nth(1).fill(String(awayScore));
        await clickResilient(saveButton);
        let freshRow = row;
        if (teamNames.length >= 2) {
          freshRow = page
            .locator('.scores-page__match')
            .filter({ hasText: teamNames[0] })
            .filter({ hasText: teamNames[1] });
        }
        const validateButton = freshRow.getByRole('button', { name: 'Valider' });
        await expect(validateButton).toBeVisible({ timeout: 10_000 });
        await clickResilient(validateButton);
      } else if ((await row.getByText('Validé', { exact: true }).count()) > 0) {
        // Defensive: the outer `alreadyValidated` check above can read a
        // stale DOM snapshot right after a previous row's validate settles
        // (see the settle-wait below) -- recheck here before assuming a
        // Valider button must still exist for this row.
        continue;
      } else {
        const validateButton = row.getByRole('button', { name: 'Valider' });
        await expect(validateButton).toBeVisible({ timeout: 10_000 });
        await clickResilient(validateButton);
      }
      // el.click() fires immediately, ahead of Angular's own change
      // detection + the validate POST's round trip -- without settling
      // here, the next outer-loop pass can re-query this exact row before
      // its "Validé" badge has actually rendered yet, misread it as still
      // needing validation, and hang forever looking for a Valider button
      // that's already gone (replaced by that not-yet-rendered badge).
      await page.waitForTimeout(300);
      // Validating reloads the whole match list (bracket may have advanced)
      // -- stop iterating this now-possibly-stale `rows` snapshot and
      // requery fresh on the next outer loop pass.
      handledOne = true;
      break;
    }

    if (!handledOne) {
      // A "pending opponents" row (knockout match whose previous round
      // isn't fully validated yet) means there's still real work coming --
      // validating that previous round's last match resolves it
      // server-side, but the client reload backing this row can lag behind
      // by a beat. Keep waiting rather than concluding "done" while any
      // such row is still on the page.
      const stillPending = (await page.locator('.scores-page__pending-badge').count()) > 0;
      consecutiveEmptyPasses += 1;
      if ((stillPending && consecutiveEmptyPasses < 30) || consecutiveEmptyPasses < 6) {
        await page.waitForTimeout(500);
        continue;
      }
      return; // nothing left to score, confirmed over several passes -- done
    }
    consecutiveEmptyPasses = 0;
  }
  throw new Error('playAllScoresToCompletion: exceeded max iterations without completing');
}
