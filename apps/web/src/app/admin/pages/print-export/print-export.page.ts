import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from 'design-system';
import { LanguageService } from 'design-tokens';
import {
  Category,
  CompetitionPhase,
  Match,
  RoundLabelLang,
  Standings,
  groupMatchesByPhaseSection,
} from 'shared-models';
import { AuthService } from '../../core/auth.service';
import { CompetitionFormatsService } from '../../core/competition-formats.service';
import { ScheduleService } from '../../core/schedule.service';
import { StandingsService } from '../../core/standings.service';
import { TournamentsService } from '../../core/tournaments.service';

interface ScheduleDay {
  label: string;
  matches: Match[];
}

interface StandingsGroup {
  groupName: string;
  standings: Standings;
}

interface BracketSection {
  label: string;
  matches: Match[];
}

interface CategoryExport {
  category: Category;
  scheduleDays: ScheduleDay[];
  scheduleUnscheduled: Match[];
  standingsGroups: StandingsGroup[];
  bracketSections: BracketSection[];
}

/**
 * Aggregates a whole tournament's calendrier + classements + tableau
 * élimination directe onto a single printable page, category by category,
 * and hands off to the browser's own "Enregistrer en PDF" print dialog --
 * the confirmed approach (no PDF-generation library, no backend endpoint).
 * Admin-only (see tournament-submenu's own comment on why the QR code
 * button is admin-only for the same reasoning): this reads every category's
 * data through the *admin* API (organization-scoped, works even before
 * publication), not the public one, which a visitor-facing export would
 * have needed instead.
 *
 * Deliberately doesn't reuse schedule.page/standings.page/scores.page as-is
 * -- those are interactive editing surfaces (drag-drop, forms, tie-break
 * selects) built around *one* selected category/phase at a time. Print
 * needs the opposite: every category at once, read-only, laid out for
 * paper rather than a viewport.
 */
@Component({
  selector: 'app-print-export-page',
  imports: [Button, RouterLink, TranslocoPipe],
  templateUrl: './print-export.page.html',
  styleUrl: './print-export.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrintExportPage {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly tournamentsService = inject(TournamentsService);
  private readonly competitionFormatsService = inject(CompetitionFormatsService);
  private readonly scheduleService = inject(ScheduleService);
  private readonly standingsService = inject(StandingsService);
  private readonly languageService = inject(LanguageService);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly tournamentId = this.route.snapshot.paramMap.get('tournamentId')!;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly tournamentName = signal('');
  protected readonly categoryExports = signal<CategoryExport[]>([]);

  constructor() {
    void this.loadAll();
  }

  protected print(): void {
    window.print();
  }

  private async loadAll(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const [tournament, categories] = await Promise.all([
        this.tournamentsService.getTournament(organizationId, this.tournamentId),
        this.tournamentsService.listCategories(organizationId, this.tournamentId),
      ]);
      this.tournamentName.set(tournament.name);
      const lang = this.languageService.language() as RoundLabelLang;
      const exports = await Promise.all(
        categories.map((category) => this.loadCategory(organizationId, category, lang)),
      );
      this.categoryExports.set(exports);
    } catch {
      this.errorMessage.set('admin.printExport.errors.load');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadCategory(
    organizationId: string,
    category: Category,
    lang: RoundLabelLang,
  ): Promise<CategoryExport> {
    const phases = await this.competitionFormatsService.listPhases(
      organizationId,
      this.tournamentId,
      category.id,
    );
    const matchesByPhase = await Promise.all(
      phases.map((phase) =>
        this.scheduleService.listMatches(organizationId, this.tournamentId, phase.id),
      ),
    );
    const allMatches = matchesByPhase.flat();

    const { days, unscheduled } = this.groupByDay(allMatches);
    const standingsGroups = await this.loadStandingsGroups(organizationId, phases);
    const bracketSections = this.buildBracketSections(phases, allMatches, lang);

    return {
      category,
      scheduleDays: days,
      scheduleUnscheduled: unscheduled,
      standingsGroups,
      bracketSections,
    };
  }

  // Same grouping shape as the public site's schedule.page.ts matchesByDay
  // -- local calendar day, unscheduled matches split into their own bucket
  // rather than dropped (the same bug already fixed on mobile, see
  // schedule.page.ts's own history there).
  private groupByDay(matches: Match[]): { days: ScheduleDay[]; unscheduled: Match[] } {
    const sorted = [...matches].sort((a, b) => {
      const aTime = a.timeSlot?.startTime ?? '';
      const bTime = b.timeSlot?.startTime ?? '';
      return aTime.localeCompare(bTime);
    });
    const days = new Map<string, ScheduleDay>();
    const unscheduled: Match[] = [];
    for (const match of sorted) {
      if (!match.timeSlot) {
        unscheduled.push(match);
        continue;
      }
      const date = new Date(match.timeSlot.startTime);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const entry = days.get(key) ?? {
        label: date.toLocaleDateString(this.languageService.language(), {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }),
        matches: [],
      };
      entry.matches.push(match);
      days.set(key, entry);
    }
    return { days: [...days.values()], unscheduled };
  }

  private async loadStandingsGroups(
    organizationId: string,
    phases: CompetitionPhase[],
  ): Promise<StandingsGroup[]> {
    const groupPhases = phases.filter(
      (phase) => phase.type === 'GROUP_STAGE' && !phase.isSeedPhase,
    );
    const groups = groupPhases.flatMap((phase) => phase.groups);
    const standingsList = await Promise.all(
      groups.map((group) =>
        this.standingsService.getStandings(organizationId, this.tournamentId, group.id),
      ),
    );
    return groups.map((group, index) => ({
      groupName: group.name,
      standings: standingsList[index],
    }));
  }

  // One section per knockout round (see groupMatchesByPhaseSection's own
  // doc comment) -- with more than one bracket tier in the same category
  // (e.g. LDC + EP), each tier's sections are prefixed with its own name so
  // "Quart de finale" from one tier doesn't read as the same round as the
  // other's.
  private buildBracketSections(
    phases: CompetitionPhase[],
    allMatches: Match[],
    lang: RoundLabelLang,
  ): BracketSection[] {
    const knockoutPhases = phases
      .filter((phase) => phase.type === 'KNOCKOUT' && phase.knockoutBracket)
      .sort((a, b) => a.position - b.position);
    const multipleTiers = knockoutPhases.length > 1;
    const sections: BracketSection[] = [];
    for (const phase of knockoutPhases) {
      const bracketId = phase.knockoutBracket!.id;
      const phaseMatches = allMatches.filter((match) => match.knockoutBracketId === bracketId);
      const prefix = multipleTiers ? `${phase.knockoutBracket!.name} — ` : '';
      for (const section of groupMatchesByPhaseSection(phase, phaseMatches, lang)) {
        sections.push({ label: `${prefix}${section.label}`, matches: section.matches });
      }
    }
    return sections;
  }

  protected formatTime(startTime: string): string {
    return new Date(startTime).toLocaleTimeString(this.languageService.language(), {
      timeStyle: 'short',
    });
  }

  protected teamLabel(team: { name: string } | null, fallback: string | null): string {
    return team?.name ?? fallback ?? '?';
  }

  protected scoreLabel(match: Match): string | null {
    if (!match.score) {
      return null;
    }
    const { homeScore, awayScore, homePenaltyScore, awayPenaltyScore } = match.score;
    const base = `${homeScore} - ${awayScore}`;
    return homePenaltyScore !== null && awayPenaltyScore !== null
      ? `${base} (${homePenaltyScore} - ${awayPenaltyScore} tab)`
      : base;
  }
}
