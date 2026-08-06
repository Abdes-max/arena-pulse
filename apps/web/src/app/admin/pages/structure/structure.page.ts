import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Button, Select, SelectOption, TextField } from 'design-system';
import { AuthService } from '../../core/auth.service';
import { CompetitionFormatsService } from '../../core/competition-formats.service';
import {
  Category,
  CompetitionGroup,
  CompetitionPhase,
  CompetitionPhaseType,
  StandingRule,
  Team,
} from '../../core/models';
import { TeamsService } from '../../core/teams.service';
import { TournamentsService } from '../../core/tournaments.service';

/**
 * The barème/qualification rules are stored per-group in the API (each
 * CompetitionGroup has its own StandingRule and QualificationRule rows),
 * but the product decision is that they read as one setting per group-stage
 * phase, not repeated per pool. This groups the identical rows created
 * across every pool of a phase into a single displayed entry, while still
 * tracking each pool's underlying row id so a save/delete can fan out to
 * all of them.
 */
interface QualificationRuleGroup {
  key: string;
  fromPosition: number;
  toPosition: number;
  targetPhaseId: string;
  targetPhaseName: string;
  ruleIdsByGroupId: Map<string, string>;
}

@Component({
  selector: 'app-structure-page',
  imports: [Button, Select, TextField],
  templateUrl: './structure.page.html',
  styleUrl: './structure.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StructurePage {
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly tournamentsService = inject(TournamentsService);
  private readonly teamsService = inject(TeamsService);
  private readonly competitionFormatsService = inject(CompetitionFormatsService);

  protected readonly organization = computed(() => this.authService.organizations()[0] ?? null);
  protected readonly tournamentId = this.route.snapshot.paramMap.get('tournamentId')!;

  protected readonly loading = signal(true);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly categories = signal<Category[]>([]);
  protected readonly selectedCategoryId = signal('');
  protected readonly phases = signal<CompetitionPhase[]>([]);
  protected readonly teams = signal<Team[]>([]);

  protected readonly newPhaseName = signal('');
  protected readonly newPhaseType = signal<CompetitionPhaseType>('GROUP_STAGE');
  protected readonly newPhaseDoubleRoundRobin = signal(false);
  protected readonly newGroupNameByPhase = signal<Record<string, string>>({});
  protected readonly newBracketFormByPhase = signal<
    Record<string, { name: string; size: string; hasRankingMatch: boolean }>
  >({});

  // Add-team form is shown for every pool at once now (not just one
  // "expanded" pool at a time), so the pending team selection is kept per
  // pool -- same Map-per-entity pattern as newGroupNameByPhase above.
  protected readonly newTeamIdToAssignByGroup = signal<Record<string, string>>({});

  // Keyed by phaseId -- one barème / one set of qualification rules per
  // group-stage phase, applied under the hood to every pool it contains.
  protected readonly phaseStandingRule = signal<Map<string, StandingRule>>(new Map());
  protected readonly phaseQualificationRuleGroups = signal<Map<string, QualificationRuleGroup[]>>(
    new Map(),
  );
  protected readonly newQualificationRuleFormByPhase = signal<
    Record<string, { fromPosition: string; toPosition: string; targetPhaseId: string }>
  >({});

  protected readonly unassignedTeams = computed(() =>
    this.teams().filter((team) => team.groupId === null),
  );

  protected readonly categoryOptions = computed<SelectOption[]>(() =>
    this.categories().map((category) => ({ value: category.id, label: category.name })),
  );
  protected readonly phaseTypeOptions: SelectOption[] = [
    { value: 'GROUP_STAGE', label: 'Poules' },
    { value: 'KNOCKOUT', label: 'Élimination directe' },
  ];
  protected readonly unassignedTeamOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Choisir une équipe', disabled: true },
    ...this.unassignedTeams().map((team) => ({ value: team.id, label: team.name })),
  ]);

  constructor() {
    void this.loadCategories();
  }

  protected teamsForGroup(groupId: string): Team[] {
    return this.teams().filter((team) => team.groupId === groupId);
  }

  private async loadCategories(): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const categories = await this.tournamentsService.listCategories(
        organizationId,
        this.tournamentId,
      );
      this.categories.set(categories);
      if (categories.length > 0) {
        this.selectedCategoryId.set(categories[0].id);
        await this.loadCategoryData();
      }
    } catch {
      this.errorMessage.set('Impossible de charger les catégories.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async onCategoryChange(categoryId: string): Promise<void> {
    this.selectedCategoryId.set(categoryId);
    this.newTeamIdToAssignByGroup.set({});
    await this.loadCategoryData();
  }

  private async loadCategoryData(): Promise<void> {
    const organizationId = this.organization()?.id;
    const categoryId = this.selectedCategoryId();
    if (!organizationId || !categoryId) {
      return;
    }
    try {
      const phases = await this.competitionFormatsService.listPhases(
        organizationId,
        this.tournamentId,
        categoryId,
      );
      this.phases.set(phases);
      this.teams.set(
        await this.teamsService.listTeams(organizationId, this.tournamentId, categoryId),
      );
      await this.loadPhaseRules(phases);
    } catch {
      this.errorMessage.set('Impossible de charger la structure de cette catégorie.');
    }
  }

  /** Loads the phase-level barème/qualification rules, represented by (and kept in sync across) every pool of each group-stage phase. */
  private async loadPhaseRules(phases: CompetitionPhase[]): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    const groupStagePhases = phases.filter(
      (phase) => phase.type === 'GROUP_STAGE' && phase.groups.length > 0,
    );

    const standingEntries = await Promise.all(
      groupStagePhases.map(
        async (phase) =>
          [
            phase.id,
            await this.competitionFormatsService.getStandingRule(
              organizationId,
              this.tournamentId,
              phase.groups[0].id,
            ),
          ] as const,
      ),
    );
    this.phaseStandingRule.set(new Map(standingEntries));

    const qualificationEntries = await Promise.all(
      groupStagePhases.map(async (phase) => {
        const perGroupRules = await Promise.all(
          phase.groups.map(
            async (group) =>
              [
                group.id,
                await this.competitionFormatsService.listQualificationRules(
                  organizationId,
                  this.tournamentId,
                  group.id,
                ),
              ] as const,
          ),
        );
        const dedup = new Map<string, QualificationRuleGroup>();
        for (const [groupId, rules] of perGroupRules) {
          for (const rule of rules) {
            const key = `${rule.fromPosition}-${rule.toPosition}-${rule.targetPhaseId}`;
            const existing = dedup.get(key);
            if (existing) {
              existing.ruleIdsByGroupId.set(groupId, rule.id);
            } else {
              dedup.set(key, {
                key,
                fromPosition: rule.fromPosition,
                toPosition: rule.toPosition,
                targetPhaseId: rule.targetPhaseId,
                targetPhaseName: rule.targetPhaseName,
                ruleIdsByGroupId: new Map([[groupId, rule.id]]),
              });
            }
          }
        }
        return [phase.id, [...dedup.values()]] as [string, QualificationRuleGroup[]];
      }),
    );
    this.phaseQualificationRuleGroups.set(new Map(qualificationEntries));
  }

  protected onNewPhaseNameChange(value: string): void {
    this.newPhaseName.set(value);
  }

  protected onNewPhaseTypeChange(type: string): void {
    this.newPhaseType.set(type as CompetitionPhaseType);
  }

  protected onNewPhaseDoubleRoundRobinChange(event: Event): void {
    this.newPhaseDoubleRoundRobin.set((event.target as HTMLInputElement).checked);
  }

  protected async addPhase(): Promise<void> {
    const organizationId = this.organization()?.id;
    const categoryId = this.selectedCategoryId();
    const name = this.newPhaseName().trim();
    if (!organizationId || !categoryId || !name) {
      return;
    }
    try {
      const phase = await this.competitionFormatsService.createPhase(
        organizationId,
        this.tournamentId,
        categoryId,
        {
          name,
          type: this.newPhaseType(),
          doubleRoundRobin:
            this.newPhaseType() === 'GROUP_STAGE' ? this.newPhaseDoubleRoundRobin() : undefined,
        },
      );
      this.phases.update((phases) => [...phases, phase]);
      this.newPhaseName.set('');
      this.newPhaseDoubleRoundRobin.set(false);
    } catch {
      this.errorMessage.set("Impossible d'ajouter cette phase (nom déjà utilisé ?).");
    }
  }

  /** Toggling this after matches already exist has no retroactive effect -- ScheduleGenerationService reads it fresh on the next "clean" generation. */
  protected async toggleDoubleRoundRobin(phase: CompetitionPhase, event: Event): Promise<void> {
    const organizationId = this.organization()?.id;
    const doubleRoundRobin = (event.target as HTMLInputElement).checked;
    if (!organizationId) {
      return;
    }
    try {
      const updated = await this.competitionFormatsService.updatePhase(
        organizationId,
        this.tournamentId,
        phase.id,
        { doubleRoundRobin },
      );
      this.phases.update((phases) => phases.map((p) => (p.id === phase.id ? updated : p)));
    } catch {
      this.errorMessage.set('Impossible de modifier ce réglage.');
    }
  }

  protected async removePhase(phase: CompetitionPhase): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      await this.competitionFormatsService.deletePhase(organizationId, this.tournamentId, phase.id);
      this.phases.update((phases) => phases.filter((p) => p.id !== phase.id));
    } catch {
      this.errorMessage.set('Impossible de supprimer cette phase.');
    }
  }

  protected groupNameFor(phaseId: string): string {
    return this.newGroupNameByPhase()[phaseId] ?? '';
  }

  protected onNewGroupNameChange(phaseId: string, value: string): void {
    this.newGroupNameByPhase.update((names) => ({ ...names, [phaseId]: value }));
  }

  protected async addGroup(phase: CompetitionPhase): Promise<void> {
    const organizationId = this.organization()?.id;
    const name = this.groupNameFor(phase.id).trim();
    if (!organizationId || !name) {
      return;
    }
    try {
      const group = await this.competitionFormatsService.createGroup(
        organizationId,
        this.tournamentId,
        phase.id,
        { name },
      );
      this.phases.update((phases) =>
        phases.map((p) => (p.id === phase.id ? { ...p, groups: [...p.groups, group] } : p)),
      );
      this.newGroupNameByPhase.update((names) => ({ ...names, [phase.id]: '' }));
      await this.applyPhaseRulesToGroup(phase.id, group.id);
    } catch {
      this.errorMessage.set("Impossible d'ajouter cette poule (nom déjà utilisé ?).");
    }
  }

  /** A new pool starts with its own default barème/no qualification rules -- immediately bring it in line with the rest of the phase, so "one setting per phase" holds even for pools added afterwards. */
  private async applyPhaseRulesToGroup(phaseId: string, groupId: string): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    const rule = this.phaseStandingRule().get(phaseId);
    if (rule) {
      await this.competitionFormatsService.updateStandingRule(
        organizationId,
        this.tournamentId,
        groupId,
        {
          winPoints: rule.winPoints,
          drawPoints: rule.drawPoints,
          lossPoints: rule.lossPoints,
          tieBreakOrder: rule.tieBreakOrder,
          supplementaryStandingEnabled: rule.supplementaryStandingEnabled,
          penaltyShootoutEnabled: rule.penaltyShootoutEnabled,
        },
      );
    }
    const ruleGroups = this.phaseQualificationRuleGroups().get(phaseId) ?? [];
    for (const ruleGroup of ruleGroups) {
      const created = await this.competitionFormatsService.createQualificationRule(
        organizationId,
        this.tournamentId,
        groupId,
        {
          fromPosition: ruleGroup.fromPosition,
          toPosition: ruleGroup.toPosition,
          targetPhaseId: ruleGroup.targetPhaseId,
        },
      );
      ruleGroup.ruleIdsByGroupId.set(groupId, created.id);
    }
    if (ruleGroups.length > 0) {
      this.phaseQualificationRuleGroups.update((map) => new Map(map).set(phaseId, [...ruleGroups]));
    }
  }

  protected async removeGroup(phase: CompetitionPhase, group: CompetitionGroup): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      await this.competitionFormatsService.deleteGroup(organizationId, this.tournamentId, group.id);
      this.phases.update((phases) =>
        phases.map((p) =>
          p.id === phase.id ? { ...p, groups: p.groups.filter((g) => g.id !== group.id) } : p,
        ),
      );
      this.newTeamIdToAssignByGroup.update((drafts) =>
        Object.fromEntries(Object.entries(drafts).filter(([id]) => id !== group.id)),
      );
      // Deleting the pool cascades its StandingRule/QualificationRule rows server-side --
      // drop the now-stale group id from the phase-level bookkeeping too.
      this.phaseQualificationRuleGroups.update((map) => {
        const ruleGroups = map.get(phase.id);
        if (!ruleGroups) {
          return map;
        }
        for (const ruleGroup of ruleGroups) {
          ruleGroup.ruleIdsByGroupId.delete(group.id);
        }
        return new Map(map).set(phase.id, [...ruleGroups]);
      });
    } catch {
      this.errorMessage.set('Impossible de supprimer cette poule.');
    }
  }

  protected standingRuleFor(phaseId: string): StandingRule | undefined {
    return this.phaseStandingRule().get(phaseId);
  }

  protected updateStandingRuleField(
    phaseId: string,
    field: keyof StandingRule,
    value: string,
  ): void {
    const numericValue = Number(value);
    this.phaseStandingRule.update((map) => {
      const rule = map.get(phaseId);
      if (!rule) {
        return map;
      }
      return new Map(map).set(phaseId, { ...rule, [field]: numericValue });
    });
  }

  protected toggleStandingRuleFlag(phaseId: string, field: keyof StandingRule, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.phaseStandingRule.update((map) => {
      const rule = map.get(phaseId);
      if (!rule) {
        return map;
      }
      return new Map(map).set(phaseId, { ...rule, [field]: checked });
    });
  }

  /** Saves the barème to every pool of this phase at once -- it's one setting per phase, not per pool. */
  protected async saveStandingRule(phase: CompetitionPhase): Promise<void> {
    const organizationId = this.organization()?.id;
    const rule = this.phaseStandingRule().get(phase.id);
    if (!organizationId || !rule || phase.groups.length === 0) {
      return;
    }
    const payload = {
      winPoints: rule.winPoints,
      drawPoints: rule.drawPoints,
      lossPoints: rule.lossPoints,
      tieBreakOrder: rule.tieBreakOrder,
      supplementaryStandingEnabled: rule.supplementaryStandingEnabled,
      penaltyShootoutEnabled: rule.penaltyShootoutEnabled,
    };
    try {
      const updated = await Promise.all(
        phase.groups.map((group) =>
          this.competitionFormatsService.updateStandingRule(
            organizationId,
            this.tournamentId,
            group.id,
            payload,
          ),
        ),
      );
      this.phaseStandingRule.update((map) => new Map(map).set(phase.id, updated[0]));
    } catch {
      this.errorMessage.set('Impossible d’enregistrer le barème de points.');
    }
  }

  protected teamIdToAssignFor(groupId: string): string {
    return this.newTeamIdToAssignByGroup()[groupId] ?? '';
  }

  protected onNewTeamIdToAssignChange(groupId: string, teamId: string): void {
    this.newTeamIdToAssignByGroup.update((drafts) => ({ ...drafts, [groupId]: teamId }));
  }

  protected async assignTeamToGroup(groupId: string): Promise<void> {
    const organizationId = this.organization()?.id;
    const teamId = this.teamIdToAssignFor(groupId);
    if (!organizationId || !teamId) {
      return;
    }
    try {
      const updated = await this.teamsService.assignGroup(
        organizationId,
        this.tournamentId,
        teamId,
        groupId,
      );
      this.teams.update((teams) => teams.map((t) => (t.id === updated.id ? updated : t)));
      this.onNewTeamIdToAssignChange(groupId, '');
    } catch {
      this.errorMessage.set("Impossible d'affecter cette équipe à la poule.");
    }
  }

  protected async unassignTeam(team: Team): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      const updated = await this.teamsService.assignGroup(
        organizationId,
        this.tournamentId,
        team.id,
        null,
      );
      this.teams.update((teams) => teams.map((t) => (t.id === updated.id ? updated : t)));
    } catch {
      this.errorMessage.set('Impossible de retirer cette équipe de la poule.');
    }
  }

  protected qualificationRuleGroupsFor(phaseId: string): QualificationRuleGroup[] {
    return this.phaseQualificationRuleGroups().get(phaseId) ?? [];
  }

  protected qualificationRuleFormFor(phaseId: string) {
    return (
      this.newQualificationRuleFormByPhase()[phaseId] ?? {
        fromPosition: '1',
        toPosition: '1',
        targetPhaseId: '',
      }
    );
  }

  protected updateQualificationRuleField(
    phaseId: string,
    field: 'fromPosition' | 'toPosition',
    value: string,
  ): void {
    const current = this.qualificationRuleFormFor(phaseId);
    this.newQualificationRuleFormByPhase.update((forms) => ({
      ...forms,
      [phaseId]: { ...current, [field]: value },
    }));
  }

  protected onTargetPhaseChange(phaseId: string, targetPhaseId: string): void {
    const current = this.qualificationRuleFormFor(phaseId);
    this.newQualificationRuleFormByPhase.update((forms) => ({
      ...forms,
      [phaseId]: { ...current, targetPhaseId },
    }));
  }

  protected targetPhaseOptions(currentPhaseId: string): SelectOption[] {
    return [
      { value: '', label: 'Phase cible', disabled: true },
      ...this.otherPhases(currentPhaseId).map((target) => ({
        value: target.id,
        label: target.name,
      })),
    ];
  }

  /** Creates the rule on every pool of this phase at once -- it's one setting per phase, not per pool. */
  protected async addQualificationRule(phase: CompetitionPhase): Promise<void> {
    const organizationId = this.organization()?.id;
    const form = this.qualificationRuleFormFor(phase.id);
    if (!organizationId || !form.targetPhaseId || phase.groups.length === 0) {
      return;
    }
    const payload = {
      fromPosition: Number(form.fromPosition),
      toPosition: Number(form.toPosition),
      targetPhaseId: form.targetPhaseId,
    };
    try {
      const created = await Promise.all(
        phase.groups.map((group) =>
          this.competitionFormatsService.createQualificationRule(
            organizationId,
            this.tournamentId,
            group.id,
            payload,
          ),
        ),
      );
      const ruleGroup: QualificationRuleGroup = {
        key: `${payload.fromPosition}-${payload.toPosition}-${payload.targetPhaseId}`,
        fromPosition: payload.fromPosition,
        toPosition: payload.toPosition,
        targetPhaseId: payload.targetPhaseId,
        targetPhaseName: created[0].targetPhaseName,
        ruleIdsByGroupId: new Map(
          phase.groups.map((group, index) => [group.id, created[index].id]),
        ),
      };
      this.phaseQualificationRuleGroups.update((map) => {
        const next = new Map(map);
        next.set(phase.id, [...(next.get(phase.id) ?? []), ruleGroup]);
        return next;
      });
    } catch {
      this.errorMessage.set("Impossible d'ajouter cette règle de qualification.");
    }
  }

  /** Removes the rule from every pool of this phase at once. */
  protected async removeQualificationRule(
    phase: CompetitionPhase,
    ruleGroup: QualificationRuleGroup,
  ): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      await Promise.all(
        [...ruleGroup.ruleIdsByGroupId.values()].map((ruleId) =>
          this.competitionFormatsService.deleteQualificationRule(
            organizationId,
            this.tournamentId,
            ruleId,
          ),
        ),
      );
      this.phaseQualificationRuleGroups.update((map) => {
        const next = new Map(map);
        next.set(
          phase.id,
          (next.get(phase.id) ?? []).filter((g) => g.key !== ruleGroup.key),
        );
        return next;
      });
    } catch {
      this.errorMessage.set('Impossible de supprimer cette règle de qualification.');
    }
  }

  protected otherPhases(currentPhaseId: string): CompetitionPhase[] {
    return this.phases().filter((phase) => phase.id !== currentPhaseId);
  }

  protected bracketFormFor(phaseId: string) {
    return (
      this.newBracketFormByPhase()[phaseId] ?? {
        name: '',
        size: '4',
        hasRankingMatch: false,
      }
    );
  }

  protected onBracketFormChange(phaseId: string, field: 'name' | 'size', value: string): void {
    const current = this.bracketFormFor(phaseId);
    this.newBracketFormByPhase.update((forms) => ({
      ...forms,
      [phaseId]: { ...current, [field]: value },
    }));
  }

  protected onBracketRankingMatchChange(phaseId: string, event: Event): void {
    const current = this.bracketFormFor(phaseId);
    const checked = (event.target as HTMLInputElement).checked;
    this.newBracketFormByPhase.update((forms) => ({
      ...forms,
      [phaseId]: { ...current, hasRankingMatch: checked },
    }));
  }

  protected async createBracket(phase: CompetitionPhase): Promise<void> {
    const organizationId = this.organization()?.id;
    const form = this.bracketFormFor(phase.id);
    if (!organizationId || !form.name.trim()) {
      return;
    }
    try {
      const bracket = await this.competitionFormatsService.createKnockoutBracket(
        organizationId,
        this.tournamentId,
        phase.id,
        {
          name: form.name.trim(),
          size: Number(form.size),
          hasRankingMatch: form.hasRankingMatch,
        },
      );
      this.phases.update((phases) =>
        phases.map((p) => (p.id === phase.id ? { ...p, knockoutBracket: bracket } : p)),
      );
    } catch {
      this.errorMessage.set('Impossible de créer ce tableau.');
    }
  }

  protected async removeBracket(phase: CompetitionPhase): Promise<void> {
    const organizationId = this.organization()?.id;
    const bracketId = phase.knockoutBracket?.id;
    if (!organizationId || !bracketId) {
      return;
    }
    try {
      await this.competitionFormatsService.deleteKnockoutBracket(
        organizationId,
        this.tournamentId,
        bracketId,
      );
      this.phases.update((phases) =>
        phases.map((p) => (p.id === phase.id ? { ...p, knockoutBracket: null } : p)),
      );
    } catch {
      this.errorMessage.set('Impossible de supprimer ce tableau.');
    }
  }

  protected readonly generatingBracketId = signal<string | null>(null);
  protected readonly bracketGeneratedMessage = signal<string | null>(null);

  protected async generateBracketMatches(phase: CompetitionPhase): Promise<void> {
    const organizationId = this.organization()?.id;
    const bracketId = phase.knockoutBracket?.id;
    if (!organizationId || !bracketId) {
      return;
    }
    this.generatingBracketId.set(bracketId);
    this.errorMessage.set(null);
    this.bracketGeneratedMessage.set(null);
    try {
      const matches = await this.competitionFormatsService.generateBracketMatches(
        organizationId,
        this.tournamentId,
        bracketId,
      );
      this.bracketGeneratedMessage.set(`${matches.length} match(s) générés pour ce tableau.`);
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 400
          ? ((error.error as { message?: string })?.message ??
              'Les équipes qualifiées ne correspondent pas encore à la taille du tableau.')
          : 'Impossible de générer les matchs de ce tableau.',
      );
    } finally {
      this.generatingBracketId.set(null);
    }
  }
}
