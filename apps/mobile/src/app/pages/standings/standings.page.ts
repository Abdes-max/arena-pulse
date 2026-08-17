import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { AssetUrlService, PublicApiService } from 'api-client';
import {
  IonButton,
  IonContent,
  IonItem,
  IonLabel,
  IonList,
  IonSegment,
  IonSegmentButton,
} from '@ionic/angular/standalone';
import { Badge, MatchCard, MatchCardTeam, MatchCardVariant } from 'design-system';
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
import { OfflineCacheService } from '../../core/offline-cache.service';
import { TournamentContextService } from '../../core/tournament-context.service';

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

type StandingsTab = 'pools' | 'final' | 'ranking';

// Swipe tuning for the round-pager below: a horizontal drag has to clear
// this many px before release commits a page change (otherwise it snaps
// back), and this many px of initial movement before the gesture is
// classified horizontal vs vertical at all.
const SWIPE_THRESHOLD_PX = 60;
const DIRECTION_LOCK_PX = 10;

interface PagerDragState {
  phaseId: string;
  startX: number;
  startY: number;
  deltaPx: number;
  direction: 'horizontal' | 'vertical' | null;
}

// localStorage (OfflineCacheService) round-trips through JSON.stringify --
// a Map wouldn't survive that, so the cached snapshot keeps bracketByPhase
// as plain [phaseId, BracketView][] entries instead.
interface CachedStandingsSnapshot {
  phases: CompetitionPhase[];
  groupStandings: GroupStandings[];
  bracketByPhaseEntries: [string, BracketView][];
  finalRanking: FinalRankingRow[];
}

@Component({
  selector: 'app-standings-page',
  imports: [
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonList,
    IonItem,
    IonLabel,
    Badge,
    MatchCard,
    IonButton,
  ],
  templateUrl: './standings.page.html',
  styleUrl: './standings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandingsPage {
  private readonly api = inject(PublicApiService);
  private readonly context = inject(TournamentContextService);
  private readonly assetUrl = inject(AssetUrlService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly cache = inject(OfflineCacheService);

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedCategoryId = signal('');
  protected readonly cachedAt = signal<number | null>(null);

  protected readonly activeTab = signal<StandingsTab>('pools');

  protected readonly phases = signal<CompetitionPhase[]>([]);
  protected readonly groupStandings = signal<GroupStandings[]>([]);
  protected readonly bracketByPhase = signal<Map<string, BracketView>>(new Map());
  protected readonly finalRanking = signal<FinalRankingRow[]>([]);

  // Round-pager position, one per bracket phase (a category can have several
  // knockout brackets, e.g. "Coupe Or"/"Coupe Argent", each paged
  // independently) -- keyed by phase id rather than a single signal so
  // paging one bracket never resets another's.
  protected readonly pageIndexByPhase = signal<Record<string, number>>({});

  // Height (px) of each bracket's currently active page, measured after
  // render and applied to its peeking (next) page below -- see
  // measureActivePageHeights' own doc comment for why this can't be pure
  // CSS (align-items: stretch alone stretches every round to the tallest
  // one *in the whole list*, e.g. round of 16, not to its own immediate
  // predecessor, which pushes a later round's peek too far down once
  // there's more than one round between it and the tallest).
  protected readonly activePageHeightPx = signal<Record<string, number>>({});

  protected readonly hasGroupStagePhase = computed(() => this.groupStandings().length > 0);

  protected readonly knockoutPhases = computed(() =>
    this.phases().filter((phase) => phase.type === 'KNOCKOUT' && phase.knockoutBracket),
  );
  protected readonly hasFinalPhase = computed(() => this.knockoutPhases().length > 0);
  // KNOCKOUT_ONLY category whose bracket hasn't been generated yet: neither
  // segment button exists, so the usual per-tab content blocks would all
  // stay silent -- shown instead of a blank screen.
  protected readonly hasNoTabsYet = computed(
    () => !this.hasGroupStagePhase() && !this.hasFinalPhase(),
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

  constructor() {
    void this.loadCategories();
    effect(() => {
      if (this.context.lastMatchEvent()) {
        void this.loadStandings();
      }
    });
    // Re-measure whenever a bracket's active page changes (round navigation)
    // or its data changes (category switch, realtime score update) --
    // deferred one frame so the new page has actually painted first (a
    // freshly-navigated-to page's height isn't known until then).
    effect(() => {
      this.pageIndexByPhase();
      this.bracketByPhase();
      requestAnimationFrame(() => this.measureActivePageHeights());
    });
  }

  // ap-match-card's own height isn't fixed (a "Terminé" badge, a forfeit
  // line, or a kickoff+venue footer all change it slightly), so the
  // peeking page's height can't be assumed from a constant -- it's read
  // directly off the currently active page's real rendered height instead
  // (see standings.page.scss's --peeking rule, which turns this into
  // justify-content: space-around spacing once applied).
  private measureActivePageHeights(): void {
    const tracks = this.elementRef.nativeElement.querySelectorAll<HTMLElement>(
      '.standings-page__pager-track[data-phase-id]',
    );
    const heights: Record<string, number> = {};
    tracks.forEach((track) => {
      const phaseId = track.dataset['phaseId'];
      if (!phaseId) {
        return;
      }
      const activePage = track.querySelector<HTMLElement>(
        `[data-page-index="${this.currentPageIndex(phaseId)}"]`,
      );
      if (activePage) {
        heights[phaseId] = activePage.getBoundingClientRect().height;
      }
    });
    this.activePageHeightPx.set(heights);
  }

  private async loadCategories(): Promise<void> {
    const slug = this.context.slug();
    const cacheKey = `standings-categories:${slug}`;
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const categories = await this.api.listCategories(slug);
      this.categories.set(categories);
      this.cache.set(cacheKey, categories);
      this.cachedAt.set(null);
      if (categories.length > 0) {
        this.selectedCategoryId.set(categories[0].id);
        await this.loadStandings();
        this.syncActiveTabToAvailability();
      }
    } catch (error) {
      const cached = this.cache.get<Category[]>(cacheKey);
      if (this.cache.isNetworkFailure(error) && cached) {
        this.categories.set(cached.data);
        this.cachedAt.set(cached.cachedAt);
        if (cached.data.length > 0) {
          this.selectedCategoryId.set(cached.data[0].id);
          await this.loadStandings();
          this.syncActiveTabToAvailability();
        }
      } else {
        this.errorMessage.set('Impossible de charger les classements.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected async onCategoryChange(categoryId: string): Promise<void> {
    this.selectedCategoryId.set(categoryId);
    await this.loadStandings();
    this.syncActiveTabToAvailability();
  }

  // The "Phase de poules" segment button doesn't exist for a KNOCKOUT_ONLY
  // category (no real pool phase to show, see hasGroupStagePhase) -- landing
  // there would leave nothing selected, so fall back to whichever tab this
  // category actually has.
  private syncActiveTabToAvailability(): void {
    this.activeTab.set(this.hasGroupStagePhase() ? 'pools' : 'final');
  }

  // One "page" per round -- the third-place match rides along on the last
  // page (same as the reference layout: final and petite finale share one
  // screen) rather than getting a page of its own.
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

  // ap-match-card is the shared design-system component web already uses
  // (card box, background, badge) -- mirrors schedule.page.ts's own helpers
  // of the same name.
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

  // ion-segment's ionChange event types its value as SegmentValue (string |
  // number) | undefined, even though every value bound here is a string id.
  protected asString(value: string | number | undefined): string {
    return String(value ?? '');
  }

  protected onTabChange(value: string | number | undefined): void {
    this.activeTab.set(value === 'final' || value === 'ranking' ? value : 'pools');
  }

  protected retry(): void {
    void this.loadCategories();
  }

  private async loadStandings(): Promise<void> {
    const slug = this.context.slug();
    const categoryId = this.selectedCategoryId();
    const cacheKey = `standings:${slug}:${categoryId}`;
    try {
      const phases = await this.api.listPhases(slug, categoryId);

      const groupPhases = phases.filter((p) => p.type === 'GROUP_STAGE' && !p.isSeedPhase);
      const groupStandings = await Promise.all(
        groupPhases.flatMap((phase) =>
          phase.groups.map(async (group) => ({
            groupId: group.id,
            groupName: group.name,
            standings: await this.api.getStandings(slug, group.id),
            qualifications: await this.api.getQualifications(slug, group.id),
          })),
        ),
      );

      const knockoutPhases = phases.filter((p) => p.type === 'KNOCKOUT' && p.knockoutBracket);
      const bracketByPhase = new Map<string, BracketView>();
      for (const phase of knockoutPhases) {
        const matches = await this.api.listBracketMatches(slug, phase.knockoutBracket!.id);
        const totalRounds = Math.log2(phase.knockoutBracket!.size);
        bracketByPhase.set(phase.id, buildBracketView(matches, totalRounds));
      }

      let finalRanking: FinalRankingRow[] = [];
      if (knockoutPhases.length > 0) {
        const allBracketMatches = await Promise.all(
          knockoutPhases.map(async (phase) => ({
            phase,
            matches: await this.api.listBracketMatches(slug, phase.knockoutBracket!.id),
          })),
        );
        finalRanking = computeFinalRanking(allBracketMatches);
      }

      this.phases.set(phases);
      this.groupStandings.set(groupStandings);
      this.bracketByPhase.set(bracketByPhase);
      this.pageIndexByPhase.set({});
      this.finalRanking.set(finalRanking);
      this.cachedAt.set(null);
      this.cache.set(cacheKey, {
        phases,
        groupStandings,
        bracketByPhaseEntries: [...bracketByPhase.entries()],
        finalRanking,
      } satisfies CachedStandingsSnapshot);
    } catch (error) {
      const cached = this.cache.get<CachedStandingsSnapshot>(cacheKey);
      if (this.cache.isNetworkFailure(error) && cached) {
        this.phases.set(cached.data.phases);
        this.groupStandings.set(cached.data.groupStandings);
        this.bracketByPhase.set(new Map(cached.data.bracketByPhaseEntries));
        this.pageIndexByPhase.set({});
        this.finalRanking.set(cached.data.finalRanking);
        this.cachedAt.set(cached.cachedAt);
      } else if (!cached) {
        this.errorMessage.set('Impossible de charger les classements pour cette catégorie.');
      }
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
}
