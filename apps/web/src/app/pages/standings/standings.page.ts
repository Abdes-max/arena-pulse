import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import {
  Badge,
  BracketMatch,
  MatchCard,
  MatchCardTeam,
  MatchCardVariant,
  Tabs,
} from 'design-system';
import { AssetUrlService, PublicApiService } from 'api-client';
import { TournamentContextService } from '../../core/tournament-context.service';
import {
  BracketView,
  Category,
  CompetitionPhase,
  FinalRankingRow,
  Match,
  Qualification,
  QualificationTierColor,
  Standings,
  buildBracketView,
  computeFinalRanking,
  qualificationTierColor,
} from 'shared-models';

interface GroupStandings {
  groupId: string;
  groupName: string;
  standings: Standings;
  qualifications: Qualification[];
}

interface QualificationTier {
  label: string;
  color: string;
  soft: string;
}

interface BracketPageCard {
  match: Match;
  cardLabel: string;
}

/** One round-pager "screen" for a bracket -- a round's matches, laid out full-width and stacked. */
interface BracketPage {
  label: string;
  cards: BracketPageCard[];
}

/** Row height (px) used to size the bracket tree so every round column shares the same total height. */
const BRACKET_ROW_HEIGHT = 96;

// Swipe tuning for the mobile-width round-pager below: a horizontal drag
// has to clear this many px before release commits a page change
// (otherwise it snaps back), and this many px of initial movement before
// the gesture is classified horizontal vs vertical at all.
const SWIPE_THRESHOLD_PX = 60;
const DIRECTION_LOCK_PX = 10;

interface PagerDragState {
  phaseId: string;
  startX: number;
  startY: number;
  deltaPx: number;
  direction: 'horizontal' | 'vertical' | null;
}

@Component({
  selector: 'app-standings-page',
  imports: [Badge, BracketMatch, MatchCard, DecimalPipe, Tabs],
  templateUrl: './standings.page.html',
  styleUrl: './standings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandingsPage {
  private readonly api = inject(PublicApiService);
  private readonly context = inject(TournamentContextService);
  private readonly assetUrl = inject(AssetUrlService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly loading = signal(true);
  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedCategoryId = signal('');
  protected readonly phases = signal<CompetitionPhase[]>([]);
  protected readonly selectedTab = signal<string>('');

  protected readonly groupStandingsByPhase = signal<Map<string, GroupStandings[]>>(new Map());
  protected readonly bracketByPhase = signal<Map<string, BracketView>>(new Map());
  protected readonly finalRanking = signal<FinalRankingRow[]>([]);

  // Round-pager position for the mobile-width bracket view below (one per
  // bracket phase) -- mirrors apps/mobile's own standings.page, kept
  // separate from selectedRoundView above which only drives the desktop
  // connected-tree's accordion focus.
  protected readonly pageIndexByPhase = signal<Record<string, number>>({});

  // Height (px) of the active page, measured after render and applied to
  // the peeking (next) page below -- see measureActivePageHeight's own
  // doc comment for why this can't be pure CSS.
  protected readonly activePageHeightPx = signal<Record<string, number>>({});

  protected readonly groupStagePhases = computed(() =>
    this.phases().filter((phase) => phase.type === 'GROUP_STAGE' && !phase.isSeedPhase),
  );
  protected readonly knockoutPhases = computed(() =>
    this.phases().filter((phase) => phase.type === 'KNOCKOUT' && phase.knockoutBracket),
  );

  // Every KNOCKOUT phase in this category, in tournament order -- used to
  // color-code and label the "Qualifié" badge once a pool's teams can be
  // routed to more than one tier (e.g. 1-2 -> LDC, 3-4 -> EP, 5 -> CF).
  // Unlike knockoutPhases above (which feeds the bracket tabs), this doesn't
  // require the bracket to already be generated -- a QualificationRule can
  // target a phase before its bracket exists.
  protected readonly qualificationTierPhases = computed(() =>
    this.phases()
      .filter((phase) => phase.type === 'KNOCKOUT')
      .sort((a, b) => a.position - b.position),
  );

  private readonly tierColorByPhaseId = computed(() => {
    const tiers = this.qualificationTierPhases();
    const map = new Map<string, QualificationTierColor>();
    tiers.forEach((phase, index) => {
      map.set(phase.id, qualificationTierColor(index, tiers.length));
    });
    return map;
  });

  protected readonly tabs = computed(() => [
    ...this.groupStagePhases().map((phase) => ({ value: phase.id, label: phase.name })),
    ...this.knockoutPhases().map((phase) => ({ value: phase.id, label: phase.name })),
    ...(this.knockoutPhases().length > 0 ? [{ value: 'final', label: 'Classement final' }] : []),
  ]);

  // Quick-jump row above the connected bracket tree, and also this bracket's
  // "accordion" focus state: clicking a round both scrolls it into view and
  // collapses every other round to a thin strip, letting the focused round's
  // own matches sit close together instead of stretched across the tree's
  // full shared height. Empty string means no round focused -- the full
  // connected tree, every round at its natural connector-aligned spacing.
  // Clicking the already-focused round again clears it back to that state.
  protected readonly selectedRoundView = signal('');
  protected readonly roundOptions = computed(() => {
    const bracket = this.bracketByPhase().get(this.selectedTab());
    if (!bracket) {
      return [];
    }
    // "Vue complète" is a real, distinct tab value (not just re-clicking the
    // focused round) -- ap-tabs only emits valueChange when the clicked
    // value differs from the currently bound one, so toggling accordion
    // focus back off needs its own option rather than relying on a
    // click-to-deselect gesture on the same tab.
    const options = [{ value: '', label: 'Vue complète' }];
    options.push(
      ...bracket.rounds.map((round) => ({ value: String(round.round), label: round.label })),
    );
    if (bracket.thirdPlaceMatch) {
      options.push({ value: 'third', label: 'Pour la 3e place' });
    }
    return options;
  });

  constructor() {
    void this.loadCategories();
    effect(() => {
      if (this.context.lastMatchEvent()) {
        void this.loadPhases();
      }
    });
    // Clears the round quick-jump's focused round if it stops existing under
    // it (bracket/phase/category change) -- doesn't force a round to be
    // focused by default, unlike the old always-select-the-first-round
    // behaviour this replaces (see selectedRoundView's own doc comment).
    effect(() => {
      const options = this.roundOptions();
      const current = this.selectedRoundView();
      if (current && !options.some((option) => option.value === current)) {
        this.selectedRoundView.set('');
      }
    });
    // Re-measure whenever the active page changes (round navigation) or the
    // bracket's data changes (tab switch, realtime score update) --
    // deferred one frame so the new page has actually painted first.
    effect(() => {
      this.pageIndexByPhase();
      this.bracketByPhase();
      requestAnimationFrame(() => this.measureActivePageHeight());
    });
  }

  // ap-match-card's own height isn't fixed (a "Terminé" badge, a forfeit
  // line, or a kickoff+venue footer all change it slightly), so the
  // peeking page's height can't be assumed from a constant -- it's read
  // directly off the currently active page's real rendered height instead
  // (see standings.page.scss's --peeking rule, which turns this into
  // justify-content: space-around spacing once applied). Only one bracket
  // is ever shown at a time here (selectedTab()), unlike apps/mobile's own
  // version of this which loops over every bracket phase.
  private measureActivePageHeight(): void {
    const track = this.elementRef.nativeElement.querySelector<HTMLElement>(
      '.standings-page__pager-track[data-phase-id]',
    );
    const phaseId = track?.dataset['phaseId'];
    if (!track || !phaseId) {
      return;
    }
    const activePage = track.querySelector<HTMLElement>(
      `[data-page-index="${this.currentPageIndex(phaseId)}"]`,
    );
    if (activePage) {
      this.activePageHeightPx.update((map) => ({
        ...map,
        [phaseId]: activePage.getBoundingClientRect().height,
      }));
    }
  }

  private async loadCategories(): Promise<void> {
    const slug = this.context.slug();
    this.loading.set(true);
    try {
      const categories = await this.api.listCategories(slug);
      this.categories.set(categories);
      if (categories.length > 0) {
        this.selectedCategoryId.set(categories[0].id);
        await this.loadPhases();
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected readonly categoryOptions = computed(() =>
    this.categories().map((category) => ({ value: category.id, label: category.name })),
  );

  protected async onCategoryChange(categoryId: string): Promise<void> {
    this.selectedCategoryId.set(categoryId);
    await this.loadPhases();
  }

  private async loadPhases(): Promise<void> {
    const slug = this.context.slug();
    const categoryId = this.selectedCategoryId();
    const phases = await this.api.listPhases(slug, categoryId);
    this.phases.set(phases);

    const groupStandings = new Map<string, GroupStandings[]>();
    for (const phase of phases.filter((p) => p.type === 'GROUP_STAGE' && !p.isSeedPhase)) {
      const perGroup = await Promise.all(
        phase.groups.map(async (group) => ({
          groupId: group.id,
          groupName: group.name,
          standings: await this.api.getStandings(slug, group.id),
          qualifications: await this.api.getQualifications(slug, group.id),
        })),
      );
      groupStandings.set(phase.id, perGroup);
    }
    this.groupStandingsByPhase.set(groupStandings);

    const bracketByPhase = new Map<string, BracketView>();
    const knockoutPhases = phases.filter((p) => p.type === 'KNOCKOUT' && p.knockoutBracket);
    for (const phase of knockoutPhases) {
      const matches = await this.api.listBracketMatches(slug, phase.knockoutBracket!.id);
      const totalRounds = Math.log2(phase.knockoutBracket!.size);
      bracketByPhase.set(phase.id, buildBracketView(matches, totalRounds));
    }
    this.bracketByPhase.set(bracketByPhase);
    this.pageIndexByPhase.set({});

    if (knockoutPhases.length > 0) {
      const allBracketMatches = await Promise.all(
        knockoutPhases.map(async (phase) => ({
          phase,
          matches: await this.api.listBracketMatches(slug, phase.knockoutBracket!.id),
        })),
      );
      this.finalRanking.set(computeFinalRanking(allBracketMatches));
    } else {
      this.finalRanking.set([]);
    }

    const tabs = this.tabs();
    this.selectedTab.set(tabs[0]?.value ?? '');
  }

  protected selectTab(tabId: string): void {
    this.selectedTab.set(tabId);
  }

  protected onRoundJump(value: string): void {
    this.selectedRoundView.set(value);
    if (value) {
      document
        .getElementById(`bracket-round-${this.selectedTab()}-${value}`)
        ?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    }
  }

  protected logoUrl(url: string | null | undefined): string | null {
    return this.assetUrl.resolve(url);
  }

  protected isQualified(group: GroupStandings, teamId: string): boolean {
    return group.qualifications.some((qualification) =>
      qualification.qualifiedTeams.some((team) => team.id === teamId),
    );
  }

  // Only meaningful once there's more than one knockout tier -- with just
  // one, the generic "Qualifié" badge (isQualified above) already says all
  // there is to say, no need to name it.
  protected qualificationTier(group: GroupStandings, teamId: string): QualificationTier | null {
    if (this.qualificationTierPhases().length < 2) {
      return null;
    }
    const qualification = group.qualifications.find((qual) =>
      qual.qualifiedTeams.some((team) => team.id === teamId),
    );
    if (!qualification) {
      return null;
    }
    const tierColor = this.tierColorByPhaseId().get(qualification.targetPhaseId);
    return tierColor ? { label: qualification.targetPhaseName, ...tierColor } : null;
  }

  protected bracketHeight(bracket: BracketView): number {
    const firstRoundCount = bracket.rounds[0]?.matches.length ?? 1;
    return firstRoundCount * BRACKET_ROW_HEIGHT;
  }

  // --- Mobile-width bracket view: one round per "page", stacked full-width
  // ap-match-card's instead of the desktop's connected tree (too dense once
  // columns start getting squeezed under ~768px). Mirrors
  // apps/mobile's own standings.page implementation of the same idea.

  // One "page" per round -- the third-place match rides along on the last
  // page (final and petite finale share one screen) rather than getting a
  // page of its own.
  protected pagesFor(bracket: BracketView): BracketPage[] {
    const pages = bracket.rounds.map((round) => ({
      label: round.label,
      cards: round.matches.map((match, index) => ({
        match,
        // Only number cards when a round actually has more than one match
        // ("Quart de finale 1/2/3/4") -- a lone final doesn't need "Finale 1".
        cardLabel:
          round.matches.length > 1 ? `${round.singularLabel} ${index + 1}` : round.singularLabel,
      })),
    }));
    if (bracket.thirdPlaceMatch && pages.length > 0) {
      pages[pages.length - 1].cards.push({
        match: bracket.thirdPlaceMatch,
        cardLabel: 'Pour la 3e place',
      });
    }
    return pages;
  }

  protected currentPageIndex(phaseId: string): number {
    return this.pageIndexByPhase()[phaseId] ?? 0;
  }

  // null (not 0) until measured -- 0 would flash the peeking page's cards
  // collapsed to zero height for one frame before the real measurement
  // lands, instead of just leaving the CSS default (natural height) until then.
  protected activePageHeight(phaseId: string): number | null {
    return this.activePageHeightPx()[phaseId] ?? null;
  }

  protected goToPage(phaseId: string, delta: number, pageCount: number): void {
    const next = Math.min(Math.max(this.currentPageIndex(phaseId) + delta, 0), pageCount - 1);
    this.pageIndexByPhase.update((map) => ({ ...map, [phaseId]: next }));
  }

  // --- Swipe (in addition to the ◁/▷ buttons above) ---
  // Only one bracket section can be actively touched at a time, so a single
  // signal is enough. Direction locks in on the first ~10px of movement
  // (see DIRECTION_LOCK_PX): once it reads as horizontal, the gesture owns
  // the pager (preventDefault stops the page itself from scrolling too);
  // once vertical, the drag is left alone and the page scrolls normally.
  // Mirrors apps/mobile's own standings.page implementation of the same idea.
  protected readonly dragState = signal<PagerDragState | null>(null);

  protected onSwipeStart(event: TouchEvent, phaseId: string): void {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    this.dragState.set({
      phaseId,
      startX: touch.clientX,
      startY: touch.clientY,
      deltaPx: 0,
      direction: null,
    });
  }

  protected onSwipeMove(event: TouchEvent, phaseId: string): void {
    const state = this.dragState();
    const touch = event.touches[0];
    if (!state || state.phaseId !== phaseId || !touch) {
      return;
    }
    const deltaPx = touch.clientX - state.startX;
    let direction = state.direction;
    if (!direction) {
      const deltaY = touch.clientY - state.startY;
      if (Math.abs(deltaPx) > DIRECTION_LOCK_PX || Math.abs(deltaY) > DIRECTION_LOCK_PX) {
        direction = Math.abs(deltaPx) > Math.abs(deltaY) ? 'horizontal' : 'vertical';
      }
    }
    if (direction === 'horizontal') {
      event.preventDefault();
    }
    this.dragState.set({ ...state, deltaPx, direction });
  }

  protected onSwipeEnd(phaseId: string, pageCount: number): void {
    const state = this.dragState();
    this.dragState.set(null);
    if (!state || state.phaseId !== phaseId || state.direction !== 'horizontal') {
      return;
    }
    if (state.deltaPx <= -SWIPE_THRESHOLD_PX) {
      this.goToPage(phaseId, 1, pageCount);
    } else if (state.deltaPx >= SWIPE_THRESHOLD_PX) {
      this.goToPage(phaseId, -1, pageCount);
    }
    // Short of the threshold: no page change, and clearing dragState above
    // already lets --drag fall back to 0 with the transition re-enabled --
    // the track visibly snaps back to the current page on its own.
  }

  protected onSwipeCancel(phaseId: string): void {
    const state = this.dragState();
    if (state?.phaseId === phaseId) {
      this.dragState.set(null);
    }
  }

  protected isDragging(phaseId: string): boolean {
    const state = this.dragState();
    return state?.phaseId === phaseId && state.direction === 'horizontal';
  }

  protected dragOffsetPx(phaseId: string): number {
    const state = this.dragState();
    return state?.phaseId === phaseId && state.direction === 'horizontal' ? state.deltaPx : 0;
  }

  protected variantFor(match: Match): MatchCardVariant {
    if (match.status === 'LIVE') {
      return 'live';
    }
    return match.score ? 'result' : 'upcoming';
  }

  protected formatKickoff(startTime: string): string {
    return new Date(startTime).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
  }

  protected teamCardInput(
    team: { name: string; logoUrl: string | null } | null,
    fallbackLabel: string | null,
  ): MatchCardTeam {
    return team
      ? { name: team.name, logoUrl: this.assetUrl.resolve(team.logoUrl) }
      : { name: fallbackLabel ?? '?' };
  }

  protected readonly podium = computed(() => {
    const ranking = this.finalRanking();
    if (ranking.length < 3) {
      return null;
    }
    const [first, second, third] = ranking;
    return { first, second, third };
  });

  protected readonly finalRankingRest = computed(() => {
    const ranking = this.finalRanking();
    return this.podium() ? ranking.slice(3) : ranking;
  });
}
