import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Button } from 'design-system';
import { AuthService } from '../../core/auth.service';
import { CompetitionFormatsService } from '../../core/competition-formats.service';
import {
  Category,
  CompetitionGroup,
  CompetitionPhase,
  CompetitionPhaseType,
  QualificationRule,
  StandingRule,
  Team,
} from '../../core/models';
import { TeamsService } from '../../core/teams.service';
import { TournamentsService } from '../../core/tournaments.service';

@Component({
  selector: 'app-structure-page',
  imports: [Button],
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
  protected readonly newGroupNameByPhase = signal<Record<string, string>>({});
  protected readonly newBracketFormByPhase = signal<
    Record<string, { name: string; size: string; hasRankingMatch: boolean }>
  >({});

  protected readonly expandedGroupId = signal<string | null>(null);
  protected readonly groupStandingRule = signal<StandingRule | null>(null);
  protected readonly groupQualificationRules = signal<QualificationRule[]>([]);
  protected readonly newTeamIdToAssign = signal('');
  protected readonly newQualificationRuleForm = signal({
    fromPosition: '1',
    toPosition: '1',
    targetPhaseId: '',
  });

  protected readonly unassignedTeams = computed(() =>
    this.teams().filter((team) => team.groupId === null),
  );

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

  protected async onCategoryChange(event: Event): Promise<void> {
    this.selectedCategoryId.set((event.target as HTMLSelectElement).value);
    this.expandedGroupId.set(null);
    await this.loadCategoryData();
  }

  private async loadCategoryData(): Promise<void> {
    const organizationId = this.organization()?.id;
    const categoryId = this.selectedCategoryId();
    if (!organizationId || !categoryId) {
      return;
    }
    try {
      this.phases.set(
        await this.competitionFormatsService.listPhases(
          organizationId,
          this.tournamentId,
          categoryId,
        ),
      );
      this.teams.set(
        await this.teamsService.listTeams(organizationId, this.tournamentId, categoryId),
      );
    } catch {
      this.errorMessage.set('Impossible de charger la structure de cette catégorie.');
    }
  }

  protected onNewPhaseNameChange(event: Event): void {
    this.newPhaseName.set((event.target as HTMLInputElement).value);
  }

  protected onNewPhaseTypeChange(event: Event): void {
    this.newPhaseType.set((event.target as HTMLSelectElement).value as CompetitionPhaseType);
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
        { name, type: this.newPhaseType() },
      );
      this.phases.update((phases) => [...phases, phase]);
      this.newPhaseName.set('');
    } catch {
      this.errorMessage.set("Impossible d'ajouter cette phase (nom déjà utilisé ?).");
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

  protected onNewGroupNameChange(phaseId: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
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
    } catch {
      this.errorMessage.set("Impossible d'ajouter cette poule (nom déjà utilisé ?).");
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
      if (this.expandedGroupId() === group.id) {
        this.expandedGroupId.set(null);
      }
    } catch {
      this.errorMessage.set('Impossible de supprimer cette poule.');
    }
  }

  protected async toggleGroupDetails(group: CompetitionGroup): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    if (this.expandedGroupId() === group.id) {
      this.expandedGroupId.set(null);
      return;
    }
    this.expandedGroupId.set(group.id);
    this.newTeamIdToAssign.set('');
    this.newQualificationRuleForm.set({ fromPosition: '1', toPosition: '1', targetPhaseId: '' });
    try {
      this.groupStandingRule.set(
        await this.competitionFormatsService.getStandingRule(
          organizationId,
          this.tournamentId,
          group.id,
        ),
      );
      this.groupQualificationRules.set(
        await this.competitionFormatsService.listQualificationRules(
          organizationId,
          this.tournamentId,
          group.id,
        ),
      );
    } catch {
      this.errorMessage.set('Impossible de charger le détail de cette poule.');
    }
  }

  protected updateStandingRuleField(field: keyof StandingRule, event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    this.groupStandingRule.update((rule) => (rule ? { ...rule, [field]: value } : rule));
  }

  protected toggleStandingRuleFlag(field: keyof StandingRule, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.groupStandingRule.update((rule) => (rule ? { ...rule, [field]: checked } : rule));
  }

  protected async saveStandingRule(): Promise<void> {
    const organizationId = this.organization()?.id;
    const groupId = this.expandedGroupId();
    const rule = this.groupStandingRule();
    if (!organizationId || !groupId || !rule) {
      return;
    }
    try {
      this.groupStandingRule.set(
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
        ),
      );
    } catch {
      this.errorMessage.set('Impossible d’enregistrer le barème de points.');
    }
  }

  protected onNewTeamIdToAssignChange(event: Event): void {
    this.newTeamIdToAssign.set((event.target as HTMLSelectElement).value);
  }

  protected async assignTeamToExpandedGroup(): Promise<void> {
    const organizationId = this.organization()?.id;
    const groupId = this.expandedGroupId();
    const teamId = this.newTeamIdToAssign();
    if (!organizationId || !groupId || !teamId) {
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
      this.newTeamIdToAssign.set('');
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

  protected updateQualificationRuleField(
    field: 'fromPosition' | 'toPosition' | 'targetPhaseId',
    event: Event,
  ): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.newQualificationRuleForm.update((form) => ({ ...form, [field]: value }));
  }

  protected async addQualificationRule(): Promise<void> {
    const organizationId = this.organization()?.id;
    const groupId = this.expandedGroupId();
    const form = this.newQualificationRuleForm();
    if (!organizationId || !groupId || !form.targetPhaseId) {
      return;
    }
    try {
      const rule = await this.competitionFormatsService.createQualificationRule(
        organizationId,
        this.tournamentId,
        groupId,
        {
          fromPosition: Number(form.fromPosition),
          toPosition: Number(form.toPosition),
          targetPhaseId: form.targetPhaseId,
        },
      );
      this.groupQualificationRules.update((rules) => [...rules, rule]);
    } catch {
      this.errorMessage.set("Impossible d'ajouter cette règle de qualification.");
    }
  }

  protected async removeQualificationRule(rule: QualificationRule): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      await this.competitionFormatsService.deleteQualificationRule(
        organizationId,
        this.tournamentId,
        rule.id,
      );
      this.groupQualificationRules.update((rules) => rules.filter((r) => r.id !== rule.id));
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

  protected onBracketFormChange(
    phaseId: string,
    field: 'name' | 'size' | 'hasRankingMatch',
    event: Event,
  ): void {
    const current = this.bracketFormFor(phaseId);
    const target = event.target as HTMLInputElement;
    const value = field === 'hasRankingMatch' ? target.checked : target.value;
    this.newBracketFormByPhase.update((forms) => ({
      ...forms,
      [phaseId]: { ...current, [field]: value },
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
