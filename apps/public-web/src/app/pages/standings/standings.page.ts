import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Badge, BracketMatch, Select } from 'design-system';
import { PublicApiService } from '../../core/public-api.service';
import { TournamentContextService } from '../../core/tournament-context.service';
import { Category, CompetitionPhase, Match, Qualification, Standings } from '../../core/models';
import { computeFinalRanking, FinalRankingRow } from './final-ranking.util';

interface GroupStandings {
  groupId: string;
  groupName: string;
  standings: Standings;
  qualifications: Qualification[];
}

interface BracketRound {
  round: number;
  label: string;
  matches: Match[];
}

interface BracketView {
  rounds: BracketRound[];
  thirdPlaceMatch: Match | null;
}

/** Row height (px) used to size the bracket tree so every round column shares the same total height. */
const BRACKET_ROW_HEIGHT = 96;

@Component({
  selector: 'app-standings-page',
  imports: [Badge, BracketMatch, Select],
  templateUrl: './standings.page.html',
  styleUrl: './standings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StandingsPage {
  private readonly api = inject(PublicApiService);
  private readonly context = inject(TournamentContextService);

  protected readonly loading = signal(true);
  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedCategoryId = signal('');
  protected readonly phases = signal<CompetitionPhase[]>([]);
  protected readonly selectedTab = signal<string>('');

  protected readonly groupStandingsByPhase = signal<Map<string, GroupStandings[]>>(new Map());
  protected readonly bracketByPhase = signal<Map<string, BracketView>>(new Map());
  protected readonly finalRanking = signal<FinalRankingRow[]>([]);

  protected readonly groupStagePhases = computed(() =>
    this.phases().filter((phase) => phase.type === 'GROUP_STAGE'),
  );
  protected readonly knockoutPhases = computed(() =>
    this.phases().filter((phase) => phase.type === 'KNOCKOUT' && phase.knockoutBracket),
  );

  protected readonly tabs = computed(() => [
    ...this.groupStagePhases().map((phase) => ({ id: phase.id, label: phase.name })),
    ...this.knockoutPhases().map((phase) => ({ id: phase.id, label: phase.name })),
    ...(this.knockoutPhases().length > 0 ? [{ id: 'final', label: 'Classement final' }] : []),
  ]);

  constructor() {
    void this.loadCategories();
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
    for (const phase of phases.filter((p) => p.type === 'GROUP_STAGE')) {
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
      bracketByPhase.set(phase.id, this.buildBracketView(matches, totalRounds));
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
    this.selectedTab.set(tabs[0]?.id ?? '');
  }

  private buildBracketView(matches: Match[], totalRounds: number): BracketView {
    const thirdPlaceMatch = matches.find((match) => match.isThirdPlaceMatch) ?? null;
    const byRound = new Map<number, Match[]>();
    for (const match of matches) {
      if (match.isThirdPlaceMatch) {
        continue;
      }
      const list = byRound.get(match.round) ?? [];
      list.push(match);
      byRound.set(match.round, list);
    }
    const rounds = [...byRound.entries()]
      .sort(([a], [b]) => a - b)
      .map(([round, roundMatches]) => ({
        round,
        label: this.roundLabel(round, totalRounds),
        matches: roundMatches.sort((a, b) => (a.bracketSlot ?? 0) - (b.bracketSlot ?? 0)),
      }));
    return { rounds, thirdPlaceMatch };
  }

  protected selectTab(tabId: string): void {
    this.selectedTab.set(tabId);
  }

  protected isQualified(group: GroupStandings, teamId: string): boolean {
    return group.qualifications.some((qualification) =>
      qualification.qualifiedTeams.some((team) => team.id === teamId),
    );
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

  private roundLabel(round: number, totalRounds: number): string {
    const fromEnd = totalRounds - round;
    if (fromEnd === 0) {
      return 'Finale';
    }
    if (fromEnd === 1) {
      return 'Demi-finales';
    }
    if (fromEnd === 2) {
      return 'Quarts de finale';
    }
    return `Tour ${round}`;
  }
}
