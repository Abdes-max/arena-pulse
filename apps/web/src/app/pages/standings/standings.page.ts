import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Badge, BracketMatch, Tabs } from 'design-system';
import { AssetUrlService, PublicApiService } from 'api-client';
import { TournamentContextService } from '../../core/tournament-context.service';
import {
  BracketView,
  Category,
  CompetitionPhase,
  FinalRankingRow,
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

/** Row height (px) used to size the bracket tree so every round column shares the same total height. */
const BRACKET_ROW_HEIGHT = 96;

@Component({
  selector: 'app-standings-page',
  imports: [Badge, BracketMatch, DecimalPipe, Tabs],
  templateUrl: './standings.page.html',
  styleUrl: './standings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandingsPage {
  private readonly api = inject(PublicApiService);
  private readonly context = inject(TournamentContextService);
  private readonly assetUrl = inject(AssetUrlService);

  protected readonly loading = signal(true);
  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedCategoryId = signal('');
  protected readonly phases = signal<CompetitionPhase[]>([]);
  protected readonly selectedTab = signal<string>('');

  protected readonly groupStandingsByPhase = signal<Map<string, GroupStandings[]>>(new Map());
  protected readonly bracketByPhase = signal<Map<string, BracketView>>(new Map());
  protected readonly finalRanking = signal<FinalRankingRow[]>([]);

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
