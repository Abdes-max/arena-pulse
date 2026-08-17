import {
  ChangeDetectionStrategy,
  Component,
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

  protected goToPage(phaseId: string, delta: number, pageCount: number): void {
    const next = Math.min(Math.max(this.currentPageIndex(phaseId) + delta, 0), pageCount - 1);
    this.pageIndexByPhase.update((map) => ({ ...map, [phaseId]: next }));
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
