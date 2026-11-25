import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { Button, Logo, Select, SelectOption, TextField } from 'design-system';
import type { CompetitionPhase } from 'shared-models';
import { environment } from '../../../../environments/environment';
import { OrganizerAuthService } from '../../core/auth.service';
import { OrganizerCategory } from '../../core/models';
import {
  BracketFirstRound,
  OrganizerStructureService,
  StructureStandingRule,
  StructureTeam,
} from '../../core/structure.service';
import { TournamentCreationService } from '../../core/tournament-creation.service';
import { showErrorsInSnackbar } from '../../../core/error-snackbar';

/** One rule of a pool phase ("1er à 2e → Phase finale"), stored once per pool. */
interface QualificationRuleGroup {
  key: string;
  fromPosition: number;
  toPosition: number;
  targetPhaseId: string;
  ruleIds: string[];
}

/**
 * Edit a tournament's structure after creation -- the app port of apps/web's
 * Structure board: pool cards (place/remove teams, random draw), bracket cards
 * (first-round pairing), and the usual settings behind each phase's ⚙. The
 * rarer settings (best-of-position qualifiers, manual tie-breaks) stay on the
 * web page, linked from here.
 */
@Component({
  selector: 'app-organizer-structure-page',
  imports: [
    Logo,
    Button,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    NgTemplateOutlet,
    Select,
    TextField,
    TranslocoPipe,
  ],
  templateUrl: './structure.page.html',
  styleUrl: './structure.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizerStructurePage {
  private readonly auth = inject(OrganizerAuthService);
  private readonly router = inject(Router);
  private readonly creationApi = inject(TournamentCreationService);
  private readonly api = inject(OrganizerStructureService);
  private readonly transloco = inject(TranslocoService);
  protected readonly tournamentId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  // Anomalies show in the red snackbar, not inline (see showErrorsInSnackbar).
  private readonly errorSnackbar = showErrorsInSnackbar(this.errorMessage);

  protected readonly categories = signal<OrganizerCategory[]>([]);
  protected readonly categoryId = signal('');
  protected readonly phases = signal<CompetitionPhase[]>([]);
  protected readonly teams = signal<StructureTeam[]>([]);
  private readonly standingRules = signal<Map<string, StructureStandingRule>>(new Map());
  private readonly ruleGroups = signal<Map<string, QualificationRuleGroup[]>>(new Map());
  protected readonly firstRounds = signal<Map<string, BracketFirstRound>>(new Map());

  protected readonly openSettings = signal<string | null>(null);
  protected readonly confirmingPhaseId = signal<string | null>(null);
  protected readonly newGroupName = signal<Record<string, string>>({});
  protected readonly bracketForm = signal<Record<string, { name: string; size: string }>>({});
  protected readonly ruleForm = signal<
    Record<string, { from: string; to: string; target: string }>
  >({});
  protected readonly pointsDraft = signal<
    Record<string, { win: string; draw: string; loss: string }>
  >({});
  protected readonly newPhaseName = signal('');
  protected readonly newPhaseType = signal<'GROUP_STAGE' | 'KNOCKOUT'>('KNOCKOUT');

  protected readonly webStructureUrl = `${environment.webUrl}/admin/tournaments/${this.tournamentId}/structure`;

  protected readonly visiblePhases = computed(() =>
    this.phases().filter((phase) => !phase.isSeedPhase),
  );
  protected readonly poolPhases = computed(() =>
    this.visiblePhases().filter((phase) => phase.type === 'GROUP_STAGE'),
  );
  protected readonly knockoutPhases = computed(() =>
    this.visiblePhases().filter((phase) => phase.type === 'KNOCKOUT'),
  );
  protected readonly unassignedTeams = computed(() =>
    this.teams().filter((team) => team.groupId === null),
  );
  protected readonly categoryOptions = computed<SelectOption[]>(() =>
    this.categories().map((category) => ({ value: category.id, label: category.name })),
  );
  protected readonly unassignedOptions = computed<SelectOption[]>(() => [
    { value: '', label: this.t('chooseTeam'), disabled: true },
    ...this.unassignedTeams().map((team) => ({ value: team.id, label: team.name })),
  ]);
  protected readonly phaseTypeOptions = computed<SelectOption[]>(() => [
    { value: 'GROUP_STAGE', label: this.t('typePools') },
    { value: 'KNOCKOUT', label: this.t('typeKnockout') },
  ]);

  constructor() {
    void this.loadCategories();
  }

  protected async goBack(): Promise<void> {
    await this.router.navigateByUrl('/organizer/tournaments');
  }

  private t(key: string, params: Record<string, unknown> = {}): string {
    return this.transloco.translate(`organizer.structure.${key}`, params);
  }

  private get organizationId(): string | undefined {
    return this.auth.organizations()[0]?.id;
  }

  private async loadCategories(): Promise<void> {
    const organizationId = this.organizationId;
    if (!organizationId) {
      this.loading.set(false);
      return;
    }
    try {
      const categories = await this.creationApi.listCategories(organizationId, this.tournamentId);
      this.categories.set(categories);
      this.categoryId.set(categories[0]?.id ?? '');
      await this.load();
    } catch {
      this.errorMessage.set('organizer.structure.errors.load');
    } finally {
      this.loading.set(false);
    }
  }

  protected async onCategoryChange(categoryId: string): Promise<void> {
    this.categoryId.set(categoryId);
    await this.load();
  }

  /** Phases, teams, and what each phase's settings and bracket cards show. */
  private async load(): Promise<void> {
    const organizationId = this.organizationId;
    const categoryId = this.categoryId();
    if (!organizationId || !categoryId) {
      return;
    }
    const [phases, teams] = await Promise.all([
      this.api.listPhases(organizationId, this.tournamentId, categoryId),
      this.api.listTeams(organizationId, this.tournamentId, categoryId),
    ]);
    this.phases.set(phases);
    this.teams.set(teams);

    const rules = new Map<string, StructureStandingRule>();
    const ruleGroups = new Map<string, QualificationRuleGroup[]>();
    for (const phase of phases.filter((p) => p.type === 'GROUP_STAGE' && p.groups.length > 0)) {
      const [standing, ...perGroup] = await Promise.all([
        this.api.getStandingRule(organizationId, this.tournamentId, phase.groups[0].id),
        ...phase.groups.map((group) =>
          this.api.listQualificationRules(organizationId, this.tournamentId, group.id),
        ),
      ]);
      rules.set(phase.id, standing);
      const byKey = new Map<string, QualificationRuleGroup>();
      for (const rule of perGroup.flat()) {
        const key = `${rule.fromPosition}-${rule.toPosition}-${rule.targetPhaseId}`;
        const entry = byKey.get(key) ?? {
          key,
          fromPosition: rule.fromPosition,
          toPosition: rule.toPosition,
          targetPhaseId: rule.targetPhaseId,
          ruleIds: [],
        };
        entry.ruleIds.push(rule.id);
        byKey.set(key, entry);
      }
      ruleGroups.set(phase.id, [...byKey.values()]);
    }
    this.standingRules.set(rules);
    this.ruleGroups.set(ruleGroups);

    const brackets = phases
      .map((phase) => phase.knockoutBracket?.id)
      .filter((id): id is string => !!id);
    const rounds = await Promise.all(
      brackets.map((id) => this.api.getFirstRound(organizationId, this.tournamentId, id)),
    );
    this.firstRounds.set(new Map(rounds.map((round) => [round.bracketId, round])));
  }

  /** Runs one change, then reloads; the API's message shows when it refuses. */
  private async run(action: (organizationId: string) => Promise<unknown>): Promise<void> {
    const organizationId = this.organizationId;
    if (!organizationId || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.errorMessage.set(null);
    try {
      await action(organizationId);
      await this.load();
    } catch (error) {
      const message =
        error instanceof HttpErrorResponse
          ? (error.error as { message?: unknown } | null)?.message
          : null;
      this.errorMessage.set(
        typeof message === 'string' ? message : 'organizer.structure.errors.save',
      );
    } finally {
      this.busy.set(false);
    }
  }

  // ---- pools ----

  protected teamsOf(groupId: string): StructureTeam[] {
    return this.teams().filter((team) => team.groupId === groupId);
  }

  protected async place(groupId: string, teamId: string): Promise<void> {
    if (teamId) {
      await this.run((org) => this.api.assignGroup(org, this.tournamentId, teamId, groupId));
    }
  }

  protected async unplace(team: StructureTeam): Promise<void> {
    await this.run((org) => this.api.assignGroup(org, this.tournamentId, team.id, null));
  }

  /** Random draw: every team not placed yet goes to the pool that has the fewest. */
  protected async shuffle(phase: CompetitionPhase): Promise<void> {
    await this.run(async (org) => {
      const pending = [...this.unassignedTeams()];
      for (let index = pending.length - 1; index > 0; index--) {
        const swap = Math.floor(Math.random() * (index + 1));
        [pending[index], pending[swap]] = [pending[swap], pending[index]];
      }
      const counts = new Map(
        phase.groups.map((group) => [group.id, this.teamsOf(group.id).length]),
      );
      for (const team of pending) {
        const target = [...phase.groups].sort(
          (a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0),
        )[0];
        await this.api.assignGroup(org, this.tournamentId, team.id, target.id);
        counts.set(target.id, (counts.get(target.id) ?? 0) + 1);
      }
    });
  }

  protected groupNameFor(phaseId: string): string {
    return this.newGroupName()[phaseId] ?? '';
  }

  protected setGroupName(phaseId: string, value: string): void {
    this.newGroupName.update((names) => ({ ...names, [phaseId]: value }));
  }

  protected async addGroup(phase: CompetitionPhase): Promise<void> {
    const name =
      this.groupNameFor(phase.id).trim() ||
      this.t('defaultPoolName', { letter: String.fromCharCode(65 + phase.groups.length) });
    await this.run((org) => this.api.createGroup(org, this.tournamentId, phase.id, name));
    this.setGroupName(phase.id, '');
  }

  protected async removeGroup(groupId: string): Promise<void> {
    await this.run((org) => this.api.deleteGroup(org, this.tournamentId, groupId));
  }

  // ---- phase settings ----

  protected toggleSettings(phaseId: string): void {
    this.openSettings.set(this.openSettings() === phaseId ? null : phaseId);
  }

  protected pointsFor(phaseId: string): { win: string; draw: string; loss: string } | null {
    const draft = this.pointsDraft()[phaseId];
    if (draft) {
      return draft;
    }
    const rule = this.standingRules().get(phaseId);
    return rule
      ? {
          win: String(rule.winPoints),
          draw: String(rule.drawPoints),
          loss: String(rule.lossPoints),
        }
      : null;
  }

  protected setPoints(phaseId: string, field: 'win' | 'draw' | 'loss', value: string): void {
    const current = this.pointsFor(phaseId);
    if (current) {
      this.pointsDraft.update((drafts) => ({
        ...drafts,
        [phaseId]: { ...current, [field]: value },
      }));
    }
  }

  /** Same barème on every pool of the phase. */
  protected async savePoints(phase: CompetitionPhase): Promise<void> {
    const rule = this.standingRules().get(phase.id);
    const points = this.pointsFor(phase.id);
    if (!rule || !points) {
      return;
    }
    await this.run((org) =>
      Promise.all(
        phase.groups.map((group) =>
          this.api.updateStandingRule(org, this.tournamentId, group.id, {
            winPoints: Number(points.win) || 0,
            drawPoints: Number(points.draw) || 0,
            lossPoints: Number(points.loss) || 0,
            tieBreakOrder: rule.tieBreakOrder,
            supplementaryStandingEnabled: rule.supplementaryStandingEnabled,
            penaltyShootoutEnabled: rule.penaltyShootoutEnabled,
          }),
        ),
      ),
    );
    this.pointsDraft.update((drafts) => {
      const next = { ...drafts };
      delete next[phase.id];
      return next;
    });
  }

  protected rulesOf(phaseId: string): QualificationRuleGroup[] {
    return this.ruleGroups().get(phaseId) ?? [];
  }

  protected phaseName(phaseId: string): string {
    return this.phases().find((phase) => phase.id === phaseId)?.name ?? '?';
  }

  protected targetOptions(): SelectOption[] {
    return [
      { value: '', label: this.t('targetPhase'), disabled: true },
      ...this.knockoutPhases().map((phase) => ({ value: phase.id, label: phase.name })),
    ];
  }

  protected ruleFormFor(phaseId: string): { from: string; to: string; target: string } {
    return this.ruleForm()[phaseId] ?? { from: '1', to: '1', target: '' };
  }

  protected setRuleForm(phaseId: string, field: 'from' | 'to' | 'target', value: string): void {
    const current = this.ruleFormFor(phaseId);
    this.ruleForm.update((forms) => ({ ...forms, [phaseId]: { ...current, [field]: value } }));
  }

  /** One rule per pool of the phase -- it's one setting for the whole phase. */
  protected async addRule(phase: CompetitionPhase): Promise<void> {
    const form = this.ruleFormFor(phase.id);
    if (!form.target || phase.groups.length === 0) {
      return;
    }
    await this.run((org) =>
      Promise.all(
        phase.groups.map((group) =>
          this.api.createQualificationRule(org, this.tournamentId, group.id, {
            fromPosition: Number(form.from) || 1,
            toPosition: Number(form.to) || Number(form.from) || 1,
            targetPhaseId: form.target,
          }),
        ),
      ),
    );
  }

  protected async removeRule(rule: QualificationRuleGroup): Promise<void> {
    await this.run((org) =>
      Promise.all(
        rule.ruleIds.map((id) => this.api.deleteQualificationRule(org, this.tournamentId, id)),
      ),
    );
  }

  // ---- brackets ----

  protected bracketFormFor(phaseId: string): { name: string; size: string } {
    return this.bracketForm()[phaseId] ?? { name: '', size: '4' };
  }

  protected setBracketForm(phaseId: string, field: 'name' | 'size', value: string): void {
    const current = this.bracketFormFor(phaseId);
    this.bracketForm.update((forms) => ({ ...forms, [phaseId]: { ...current, [field]: value } }));
  }

  protected async createBracket(phase: CompetitionPhase): Promise<void> {
    const form = this.bracketFormFor(phase.id);
    await this.run((org) =>
      this.api.createBracket(org, this.tournamentId, phase.id, {
        name: form.name.trim() || phase.name,
        size: Number(form.size) || 4,
        hasRankingMatch: false,
      }),
    );
  }

  protected async toggleRankingMatch(phase: CompetitionPhase, event: Event): Promise<void> {
    const bracket = phase.knockoutBracket;
    const hasRankingMatch = (event.target as HTMLInputElement).checked;
    if (bracket) {
      await this.run((org) =>
        this.api.updateBracket(org, this.tournamentId, bracket.id, { hasRankingMatch }),
      );
    }
  }

  protected async removeBracket(phase: CompetitionPhase): Promise<void> {
    const bracket = phase.knockoutBracket;
    if (bracket) {
      await this.run((org) => this.api.deleteBracket(org, this.tournamentId, bracket.id));
    }
  }

  /** The pairing editor needs exactly one qualifier per place. */
  protected editableRound(bracketId: string): BracketFirstRound | null {
    const round = this.firstRounds().get(bracketId);
    return round && round.qualifiers.length === round.size ? round : null;
  }

  protected roundMatches(round: BracketFirstRound): { home: number; away: number }[] {
    return Array.from({ length: round.size / 2 }, (_, index) => ({
      home: round.order[index * 2],
      away: round.order[index * 2 + 1],
    }));
  }

  protected qualifierOptions(round: BracketFirstRound): SelectOption[] {
    return round.qualifiers.map((label, index) => ({ value: String(index), label }));
  }

  /** Puts the chosen qualifier at this position; whoever held it takes the freed place. */
  protected async changePairing(
    round: BracketFirstRound,
    position: number,
    value: string,
  ): Promise<void> {
    const chosen = Number(value);
    if (!Number.isInteger(chosen) || round.order[position] === chosen) {
      return;
    }
    const order = [...round.order];
    order[order.indexOf(chosen)] = order[position];
    order[position] = chosen;
    await this.run((org) => this.api.setFirstRound(org, this.tournamentId, round.bracketId, order));
  }

  protected async resetPairing(round: BracketFirstRound): Promise<void> {
    await this.run((org) => this.api.setFirstRound(org, this.tournamentId, round.bracketId, null));
  }

  // ---- phases ----

  protected async addPhase(): Promise<void> {
    const name = this.newPhaseName().trim();
    const categoryId = this.categoryId();
    if (!name || !categoryId) {
      return;
    }
    await this.run((org) =>
      this.api.createPhase(org, this.tournamentId, categoryId, {
        name,
        type: this.newPhaseType(),
        position: this.phases().length,
      }),
    );
    this.newPhaseName.set('');
  }

  protected async removePhase(phase: CompetitionPhase): Promise<void> {
    this.confirmingPhaseId.set(null);
    await this.run((org) => this.api.deletePhase(org, this.tournamentId, phase.id));
  }

  protected onNewPhaseType(value: string): void {
    this.newPhaseType.set(value === 'GROUP_STAGE' ? 'GROUP_STAGE' : 'KNOCKOUT');
  }
}
