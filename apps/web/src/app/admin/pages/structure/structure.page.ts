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
  CrossGroupQualificationRule,
  StandingRule,
  Team,
  Venue,
} from '../../core/models';
import { TeamsService } from '../../core/teams.service';
import { TournamentsService } from '../../core/tournaments.service';
import { FieldSelector } from '../../shared/field-selector';

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
  imports: [Button, Select, TextField, FieldSelector],
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

  // Keyed by phaseId -- unlike QualificationRule, these are phase-scoped
  // directly server-side (not duplicated per pool), so there's no
  // per-group dedup/fan-out needed here.
  protected readonly phaseCrossGroupRules = signal<Map<string, CrossGroupQualificationRule[]>>(
    new Map(),
  );
  protected readonly newCrossGroupRuleFormByPhase = signal<
    Record<string, { position: string; bestCount: string; targetPhaseId: string }>
  >({});

  protected readonly unassignedTeams = computed(() =>
    this.teams().filter((team) => team.groupId === null),
  );

  // "Mode Tournoi" -- one-click structure + pool calendar generator, only
  // offered while the category has no phases yet (see structure-presets.service.ts).
  protected readonly venues = signal<Venue[]>([]);
  protected readonly fields = computed(() =>
    this.venues().flatMap((venue) =>
      venue.fields.map((field) => ({ ...field, venueName: venue.name })),
    ),
  );

  protected readonly presetTeamCount = signal('');
  protected readonly presetPoolCount = signal('');
  protected readonly presetFieldIds = signal<string[]>([]);
  protected readonly presetStartDateTime = signal('');
  protected readonly presetKnockoutFieldIds = signal<string[]>([]);
  protected readonly presetKnockoutStartDateTime = signal('');
  protected readonly presetSubmitting = signal(false);
  protected readonly presetError = signal<string | null>(null);
  protected readonly presetSuccessMessage = signal<string | null>(null);

  // "Qualifier vers plusieurs compétitions" -- off by default, the pool
  // phase feeds a single knockout tier (today's behaviour). On, the
  // organizer edits a named list of tiers, each claiming the next slice of
  // standing positions (tier 1: 1..q1, tier 2: q1+1..q1+q2, ...).
  protected readonly presetMultiTierEnabled = signal(false);
  protected readonly presetTiers = signal<{ name: string; qualifiersPerPool: string }[]>([
    { name: 'Tableau final', qualifiersPerPool: '' },
  ]);

  // "Inclure les meilleurs classés à une position" -- best-of-position
  // candidates join the first tier's bracket alongside its direct qualifiers.
  protected readonly presetBestOfPositionEnabled = signal(false);
  protected readonly presetBestOfPositionPosition = signal('');
  protected readonly presetBestOfPositionBestCount = signal('');

  protected readonly presetTiersTotalQualifiersPerPool = computed(() =>
    this.presetTiers().reduce((sum, tier) => sum + (Number(tier.qualifiersPerPool) || 0), 0),
  );

  protected readonly presetTierBracketSizes = computed(() => {
    const poolCount = Number(this.presetPoolCount());
    if (!poolCount) {
      return [];
    }
    const bestCount = this.presetBestOfPositionEnabled()
      ? Number(this.presetBestOfPositionBestCount()) || 0
      : 0;
    return this.presetTiers().map((tier, index) => ({
      name: tier.name.trim() || `Palier ${index + 1}`,
      size: poolCount * (Number(tier.qualifiersPerPool) || 0) + (index === 0 ? bestCount : 0),
    }));
  });

  // Client-side mirror of structure-presets.service.ts's validation -- lets
  // the organizer fix an impossible combination before submitting, instead
  // of round-tripping to the API to find out.
  protected readonly presetValidationError = computed<string | null>(() => {
    const teamCount = Number(this.presetTeamCount());
    const poolCount = Number(this.presetPoolCount());
    const tiers = this.presetTiers();
    if (!teamCount || !poolCount || tiers.some((tier) => !Number(tier.qualifiersPerPool))) {
      return null;
    }
    if (poolCount > teamCount) {
      return 'Le nombre de poules ne peut pas dépasser le nombre d’équipes.';
    }
    const smallestPoolSize = Math.floor(teamCount / poolCount);
    const totalDirectQualifiersPerPool = this.presetTiersTotalQualifiersPerPool();
    if (totalDirectQualifiersPerPool > smallestPoolSize) {
      return `Avec ${teamCount} équipes réparties en ${poolCount} poules, la plus petite poule ne compte que ${smallestPoolSize} équipe(s) — impossible d'en qualifier ${totalDirectQualifiersPerPool} au total en cumulant les paliers.`;
    }

    const bestOfPositionEnabled = this.presetBestOfPositionEnabled();
    const bestPosition = Number(this.presetBestOfPositionPosition());
    const bestCount = Number(this.presetBestOfPositionBestCount());
    if (bestOfPositionEnabled && bestPosition && bestCount) {
      if (bestCount > poolCount) {
        return `Impossible de qualifier ${bestCount} meilleur(s) classé(s) à la position ${bestPosition} : il n'y a que ${poolCount} poule(s).`;
      }
      if (bestPosition <= totalDirectQualifiersPerPool) {
        return `La position ${bestPosition} des meilleurs classés chevauche les qualifiés directs (positions 1 à ${totalDirectQualifiersPerPool}) — choisissez une position strictement supérieure.`;
      }
      if (bestPosition > smallestPoolSize) {
        return `La position ${bestPosition} n'existe pas dans toutes les poules — la plus petite poule ne compte que ${smallestPoolSize} équipe(s).`;
      }
    }

    for (const [index, tier] of tiers.entries()) {
      const qualifiers = Number(tier.qualifiersPerPool);
      const bracketBestCount = index === 0 && bestOfPositionEnabled ? bestCount || 0 : 0;
      const bracketSize = poolCount * qualifiers + bracketBestCount;
      if (!(bracketSize >= 2 && (bracketSize & (bracketSize - 1)) === 0)) {
        const detail = bracketBestCount
          ? `${poolCount} poule(s) × ${qualifiers} qualifié(s) + ${bracketBestCount} meilleur(s) classé(s)`
          : `${poolCount} poule(s) × ${qualifiers} qualifié(s)`;
        return `Palier "${tier.name.trim() || `Palier ${index + 1}`}" : ${detail} = ${bracketSize} équipe(s) qualifiée(s) — ce nombre doit être une puissance de 2 (2, 4, 8, 16…) pour former un tableau à élimination directe.`;
      }
    }

    if (this.unassignedTeams().length !== teamCount) {
      return `${this.unassignedTeams().length} équipe(s) non assignée(s) trouvée(s) dans cette catégorie, ${teamCount} attendue(s).`;
    }
    return null;
  });

  protected readonly presetCanSubmit = computed(
    () =>
      Number(this.presetTeamCount()) > 0 &&
      Number(this.presetPoolCount()) > 0 &&
      this.presetTiers().every(
        (tier) => tier.name.trim() !== '' && Number(tier.qualifiersPerPool) > 0,
      ) &&
      (!this.presetBestOfPositionEnabled() ||
        (Number(this.presetBestOfPositionPosition()) > 0 &&
          Number(this.presetBestOfPositionBestCount()) > 0)) &&
      this.presetFieldIds().length > 0 &&
      this.presetStartDateTime() !== '' &&
      this.presetKnockoutFieldIds().length > 0 &&
      this.presetKnockoutStartDateTime() !== '' &&
      this.presetValidationError() === null,
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
      this.venues.set(await this.tournamentsService.listVenues(organizationId, this.tournamentId));
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
    this.resetPresetForm();
    await this.loadCategoryData();
  }

  private resetPresetForm(): void {
    this.presetTeamCount.set('');
    this.presetPoolCount.set('');
    this.presetMultiTierEnabled.set(false);
    this.presetTiers.set([{ name: 'Tableau final', qualifiersPerPool: '' }]);
    this.presetBestOfPositionEnabled.set(false);
    this.presetBestOfPositionPosition.set('');
    this.presetBestOfPositionBestCount.set('');
    this.presetFieldIds.set([]);
    this.presetStartDateTime.set('');
    this.presetKnockoutFieldIds.set([]);
    this.presetKnockoutStartDateTime.set('');
    this.presetError.set(null);
    this.presetSuccessMessage.set(null);
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
      // Default "Mode Tournoi" to however many teams are actually sitting
      // unassigned right now -- typing a number and getting "0 équipe(s)
      // trouvée(s)" back is a confusing way to discover this generator
      // distributes existing teams rather than creating new ones.
      if (!this.presetTeamCount()) {
        const unassignedCount = this.unassignedTeams().length;
        if (unassignedCount > 0) {
          this.presetTeamCount.set(String(unassignedCount));
        }
      }
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

    const crossGroupEntries = await Promise.all(
      groupStagePhases.map(
        async (phase) =>
          [
            phase.id,
            await this.competitionFormatsService.listCrossGroupQualificationRules(
              organizationId,
              this.tournamentId,
              phase.id,
            ),
          ] as const,
      ),
    );
    this.phaseCrossGroupRules.set(new Map(crossGroupEntries));
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

  protected crossGroupRulesFor(phaseId: string): CrossGroupQualificationRule[] {
    return this.phaseCrossGroupRules().get(phaseId) ?? [];
  }

  protected crossGroupRuleFormFor(phaseId: string) {
    return (
      this.newCrossGroupRuleFormByPhase()[phaseId] ?? {
        position: '',
        bestCount: '',
        targetPhaseId: '',
      }
    );
  }

  protected updateCrossGroupRuleField(
    phaseId: string,
    field: 'position' | 'bestCount',
    value: string,
  ): void {
    const current = this.crossGroupRuleFormFor(phaseId);
    this.newCrossGroupRuleFormByPhase.update((forms) => ({
      ...forms,
      [phaseId]: { ...current, [field]: value },
    }));
  }

  protected onCrossGroupTargetPhaseChange(phaseId: string, targetPhaseId: string): void {
    const current = this.crossGroupRuleFormFor(phaseId);
    this.newCrossGroupRuleFormByPhase.update((forms) => ({
      ...forms,
      [phaseId]: { ...current, targetPhaseId },
    }));
  }

  protected async addCrossGroupRule(phase: CompetitionPhase): Promise<void> {
    const organizationId = this.organization()?.id;
    const form = this.crossGroupRuleFormFor(phase.id);
    const position = Number(form.position);
    const bestCount = Number(form.bestCount);
    if (!organizationId || !form.targetPhaseId || !position || !bestCount) {
      return;
    }
    try {
      const created = await this.competitionFormatsService.createCrossGroupQualificationRule(
        organizationId,
        this.tournamentId,
        phase.id,
        { position, bestCount, targetPhaseId: form.targetPhaseId },
      );
      this.phaseCrossGroupRules.update((map) => {
        const next = new Map(map);
        next.set(phase.id, [...(next.get(phase.id) ?? []), created]);
        return next;
      });
      this.newCrossGroupRuleFormByPhase.update((forms) => ({
        ...forms,
        [phase.id]: { position: '', bestCount: '', targetPhaseId: '' },
      }));
    } catch {
      this.errorMessage.set("Impossible d'ajouter cette règle de meilleurs classés.");
    }
  }

  protected async removeCrossGroupRule(
    phase: CompetitionPhase,
    rule: CrossGroupQualificationRule,
  ): Promise<void> {
    const organizationId = this.organization()?.id;
    if (!organizationId) {
      return;
    }
    try {
      await this.competitionFormatsService.deleteCrossGroupQualificationRule(
        organizationId,
        this.tournamentId,
        rule.id,
      );
      this.phaseCrossGroupRules.update((map) => {
        const next = new Map(map);
        next.set(
          phase.id,
          (next.get(phase.id) ?? []).filter((r) => r.id !== rule.id),
        );
        return next;
      });
    } catch {
      this.errorMessage.set('Impossible de supprimer cette règle.');
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

  protected onPresetTeamCountChange(value: string): void {
    this.presetTeamCount.set(value);
  }

  protected onPresetPoolCountChange(value: string): void {
    this.presetPoolCount.set(value);
  }

  protected onPresetMultiTierToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.presetMultiTierEnabled.set(checked);
    if (checked) {
      if (this.presetTiers().length < 2) {
        this.presetTiers.update((tiers) => [...tiers, { name: '', qualifiersPerPool: '' }]);
      }
    } else {
      // Collapse back to a single tier -- keep its qualifiersPerPool value
      // (that's the field still shown), but restore the default name.
      this.presetTiers.update((tiers) => [{ ...tiers[0], name: 'Tableau final' }]);
    }
  }

  protected onPresetTierNameChange(index: number, value: string): void {
    this.presetTiers.update((tiers) =>
      tiers.map((tier, i) => (i === index ? { ...tier, name: value } : tier)),
    );
  }

  protected onPresetTierQualifiersChange(index: number, value: string): void {
    this.presetTiers.update((tiers) =>
      tiers.map((tier, i) => (i === index ? { ...tier, qualifiersPerPool: value } : tier)),
    );
  }

  protected addPresetTier(): void {
    this.presetTiers.update((tiers) => [...tiers, { name: '', qualifiersPerPool: '' }]);
  }

  protected removePresetTier(index: number): void {
    this.presetTiers.update((tiers) =>
      tiers.length > 1 ? tiers.filter((_, i) => i !== index) : tiers,
    );
  }

  protected onPresetBestOfPositionToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.presetBestOfPositionEnabled.set(checked);
    // Pre-fill with the next free standing position -- the first one not
    // already claimed by a direct qualifier -- so the organizer usually
    // only has to fill in the count.
    if (checked && !this.presetBestOfPositionPosition()) {
      this.presetBestOfPositionPosition.set(String(this.presetTiersTotalQualifiersPerPool() + 1));
    }
  }

  protected onPresetBestOfPositionPositionChange(value: string): void {
    this.presetBestOfPositionPosition.set(value);
  }

  protected onPresetBestOfPositionBestCountChange(value: string): void {
    this.presetBestOfPositionBestCount.set(value);
  }

  protected onPresetStartDateTimeChange(value: string): void {
    this.presetStartDateTime.set(value);
  }

  protected onPresetKnockoutStartDateTimeChange(value: string): void {
    this.presetKnockoutStartDateTime.set(value);
  }

  protected async generateStructurePreset(): Promise<void> {
    const organizationId = this.organization()?.id;
    const categoryId = this.selectedCategoryId();
    if (!organizationId || !categoryId || !this.presetCanSubmit() || this.presetSubmitting()) {
      return;
    }
    this.presetSubmitting.set(true);
    this.presetError.set(null);
    this.presetSuccessMessage.set(null);
    const poolCount = this.presetPoolCount();
    try {
      const result = await this.competitionFormatsService.createStructurePreset(
        organizationId,
        this.tournamentId,
        categoryId,
        {
          teamCount: Number(this.presetTeamCount()),
          poolCount: Number(poolCount),
          tiers: this.presetTiers().map((tier) => ({
            name: tier.name.trim(),
            qualifiersPerPool: Number(tier.qualifiersPerPool),
          })),
          ...(this.presetBestOfPositionEnabled() && {
            bestOfPosition: {
              position: Number(this.presetBestOfPositionPosition()),
              bestCount: Number(this.presetBestOfPositionBestCount()),
            },
          }),
          fieldIds: this.presetFieldIds(),
          startDateTime: new Date(this.presetStartDateTime()).toISOString(),
          knockoutFieldIds: this.presetKnockoutFieldIds(),
          knockoutStartDateTime: new Date(this.presetKnockoutStartDateTime()).toISOString(),
        },
      );
      this.resetPresetForm();
      const tiersSummary = result.tiers
        .map((tier) => `${tier.name} (${tier.bracketSize} équipes)`)
        .join(', ');
      this.presetSuccessMessage.set(
        `Structure générée : ${poolCount} poules, ${tiersSummary}. Le calendrier des poules est prêt sur la page Calendrier.`,
      );
      await this.loadCategoryData();
    } catch (error) {
      this.presetError.set(
        error instanceof HttpErrorResponse &&
          typeof (error.error as { message?: unknown })?.message === 'string'
          ? (error.error as { message: string }).message
          : 'Impossible de générer la structure.',
      );
    } finally {
      this.presetSubmitting.set(false);
    }
  }
}
