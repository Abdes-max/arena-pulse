import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Category,
  CompetitionPhase,
  CompetitionPhaseType,
  KnockoutBracket,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isPowerOfTwo, seedOrder } from './bracket-seeding.util';
import { CategoriesService } from './categories.service';
import {
  CrossGroupQualificationRulesService,
  QualificationSlot,
} from './cross-group-qualification-rules.service';
import { GenerateAllBracketMatchesDto } from './dto/generate-all-bracket-matches.dto';
import { GenerateBracketMatchesDto } from './dto/generate-bracket-matches.dto';
import { getLoserTeamId, getWinnerTeamId } from './match-outcome.util';
import {
  MATCH_INCLUDE,
  MatchWithRelations,
  toMatchSummary,
} from './match-summary.util';
import { ordinal, roundLabel } from './ordinal.util';
import { RealtimeService } from './realtime.service';
import { StandingsService } from './standings.service';
import { TournamentsService } from './tournaments.service';

type BracketWithPhase = KnockoutBracket & {
  phase: CompetitionPhase & { category: Category };
};

interface SlotDef {
  round: number;
  bracketSlot: number;
  isThirdPlaceMatch: boolean;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeSourceLabel: string | null;
  awaySourceLabel: string | null;
}

@Injectable()
export class BracketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly categoriesService: CategoriesService,
    private readonly standingsService: StandingsService,
    private readonly realtimeService: RealtimeService,
    private readonly crossGroupQualificationRulesService: CrossGroupQualificationRulesService,
  ) {}

  async generateMatches(
    organizationId: string,
    tournamentId: string,
    bracketId: string,
    dto: GenerateBracketMatchesDto = {},
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const bracket = await this.getOrThrowForTournament(tournamentId, bracketId);

    const existingCount = await this.prisma.match.count({
      where: { knockoutBracketId: bracketId },
    });
    if (existingCount > 0) {
      throw new ConflictException(
        'Les matchs de ce tableau ont déjà été générés.',
      );
    }
    if (!isPowerOfTwo(bracket.size)) {
      throw new BadRequestException(
        `La génération ne prend en charge que des tailles de tableau en puissance de deux (2, 4, 8, 16…) ; taille actuelle : ${bracket.size}.`,
      );
    }

    const slots = await this.resolveQualificationSlots(
      organizationId,
      tournamentId,
      bracket.phaseId,
    );
    if (slots.length !== bracket.size) {
      throw new BadRequestException(
        `Ce tableau doit compter ${bracket.size} équipes qualifiées au total, mais ${slots.length} sont définies par les règles de qualification -- vérifiez la configuration.`,
      );
    }

    let fieldCursors: Map<string, Date> | undefined;
    if (dto.fieldIds?.length) {
      if (!dto.startDateTime) {
        throw new BadRequestException(
          'Une date de début est requise pour planifier ce tableau sur des terrains.',
        );
      }
      await this.assertFieldsBelongToTournament(tournamentId, dto.fieldIds);
      fieldCursors = new Map(
        dto.fieldIds.map((fieldId) => [fieldId, new Date(dto.startDateTime!)]),
      );
    }
    const matchDurationMinutes =
      dto.matchDurationMinutes ?? bracket.phase.matchDurationMinutes;
    const breakDurationMinutes =
      dto.breakDurationMinutes ?? bracket.phase.breakDurationMinutes;

    const totalRounds = Math.log2(bracket.size);
    const slotDefs: SlotDef[] = [];
    for (let round = 1; round <= totalRounds; round++) {
      slotDefs.push(...this.buildRoundSlotDefs(bracket, slots, round));
    }
    const fieldIndexRef = { current: 0 };
    const created = await this.prisma.$transaction((tx) =>
      this.createMatches(
        tx,
        bracket,
        slotDefs,
        dto.fieldIds,
        fieldCursors,
        fieldIndexRef,
        matchDurationMinutes,
        breakDurationMinutes,
      ),
    );
    return created.map((match) => toMatchSummary(match));
  }

  /**
   * Generates every knockout tier's matches for a category in one shot --
   * required once qualification splits into multiple tiers (e.g. Ligue des
   * Champions / Europa League from the same pool phase): they must be
   * scheduled together on shared fields, not one at a time. The start time
   * isn't picked by hand -- it's the pool phase's last scheduled match plus
   * a configurable break, computed here so the organizer only enters the
   * break once, on the Calendrier page.
   */
  async generateAllMatches(
    organizationId: string,
    tournamentId: string,
    categoryId: string,
    dto: GenerateAllBracketMatchesDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.categoriesService.assertCategoryExists(tournamentId, categoryId);

    const knockoutPhases = await this.prisma.competitionPhase.findMany({
      where: { categoryId, type: CompetitionPhaseType.KNOCKOUT },
      include: { knockoutBracket: true, category: true },
      orderBy: { position: 'asc' },
    });
    if (knockoutPhases.length === 0) {
      throw new BadRequestException(
        'Cette catégorie n’a aucune phase à élimination directe.',
      );
    }
    const missingBracket = knockoutPhases.find(
      (phase) => !phase.knockoutBracket,
    );
    if (missingBracket) {
      throw new BadRequestException(
        `La phase "${missingBracket.name}" n’a pas encore de tableau.`,
      );
    }
    const brackets: BracketWithPhase[] = knockoutPhases.map((phase) => ({
      ...phase.knockoutBracket!,
      phase,
    }));

    await this.assertFieldsBelongToTournament(tournamentId, dto.fieldIds);

    const poolPhase = await this.prisma.competitionPhase.findFirst({
      where: { categoryId, type: CompetitionPhaseType.GROUP_STAGE },
    });

    // A real pool phase feeds the knockout start time (last scheduled pool
    // match's end + a configurable break). A category with no pool phase at
    // all, or only the fictitious seed phase a KNOCKOUT_ONLY structure
    // preset creates (CompetitionPhase.isSeedPhase -- it never has scheduled
    // matches, by design), has nothing to compute from: the organizer picks
    // the start time directly instead.
    let startDateTime: Date;
    if (poolPhase && !poolPhase.isSeedPhase) {
      const lastPoolMatch = await this.prisma.match.findFirst({
        where: { group: { phaseId: poolPhase.id }, timeSlotId: { not: null } },
        include: { timeSlot: true },
        orderBy: { timeSlot: { endTime: 'desc' } },
      });
      if (!lastPoolMatch?.timeSlot) {
        throw new BadRequestException(
          'Générez d’abord le calendrier des poules avant celui de l’élimination directe.',
        );
      }
      startDateTime = new Date(
        lastPoolMatch.timeSlot.endTime.getTime() +
          (dto.breakAfterPoolsMinutes ?? 0) * 60_000,
      );
    } else {
      if (!dto.startDateTime) {
        throw new BadRequestException(
          'Une date de début est requise (cette catégorie n’a pas de phase de poules à partir de laquelle la calculer).',
        );
      }
      startDateTime = new Date(dto.startDateTime);
    }

    // Validate every bracket up front, cumulating every failure instead of
    // stopping at the first -- the organizer sees the full picture in one
    // pass rather than fixing tiers one error at a time.
    const errors: string[] = [];
    const bracketPlans: {
      bracket: BracketWithPhase;
      slots: QualificationSlot[];
    }[] = [];
    for (const bracket of brackets) {
      const existingCount = await this.prisma.match.count({
        where: { knockoutBracketId: bracket.id },
      });
      if (existingCount > 0) {
        errors.push(`"${bracket.name}" a déjà des matchs générés.`);
        continue;
      }
      if (!isPowerOfTwo(bracket.size)) {
        errors.push(
          `"${bracket.name}" : la taille ${bracket.size} n'est pas une puissance de 2.`,
        );
        continue;
      }
      const slots = await this.resolveQualificationSlots(
        organizationId,
        tournamentId,
        bracket.phaseId,
      );
      if (slots.length !== bracket.size) {
        errors.push(
          `"${bracket.name}" doit compter ${bracket.size} équipes qualifiées au total, mais ${slots.length} sont définies par les règles de qualification.`,
        );
        continue;
      }
      bracketPlans.push({ bracket, slots });
    }
    if (errors.length > 0) {
      throw new BadRequestException(errors.join(' '));
    }

    const created = await this.prisma.$transaction(async (tx) => {
      // One shared cursor per field across every tier -- a tier's rounds
      // continue on the same fields where the previous tier's left off,
      // rather than every tier restarting at the computed start time.
      const fieldCursors = new Map(
        dto.fieldIds.map((fieldId) => [fieldId, startDateTime] as const),
      );
      const fieldIndexRef = { current: 0 };
      const allMatches: MatchWithRelations[] = [];

      // All tiers' matches at the same distance from their own final are
      // scheduled together before moving to the next round -- e.g. every
      // tier's quarterfinals, then every tier's semifinals, then every
      // tier's final -- rather than finishing one tier's entire bracket
      // before starting the next tier's first round. A tier with a
      // smaller bracket simply has no round at the earliest distances (a
      // size-4 bracket's own round 1 already *is* the semifinal stage) and
      // is skipped there, joining in once the shared distance reaches its
      // own first round.
      const maxTotalRounds = Math.max(
        ...bracketPlans.map(({ bracket }) => Math.log2(bracket.size)),
      );
      for (let fromEnd = maxTotalRounds - 1; fromEnd >= 0; fromEnd--) {
        for (const { bracket, slots } of bracketPlans) {
          const totalRounds = Math.log2(bracket.size);
          const round = totalRounds - fromEnd;
          if (round < 1 || round > totalRounds) {
            continue;
          }
          const matchDurationMinutes =
            dto.matchDurationMinutes ?? bracket.phase.matchDurationMinutes;
          const breakDurationMinutes =
            dto.breakDurationMinutes ?? bracket.phase.breakDurationMinutes;
          const slotDefs = this.buildRoundSlotDefs(bracket, slots, round);
          allMatches.push(
            ...(await this.createMatches(
              tx,
              bracket,
              slotDefs,
              dto.fieldIds,
              fieldCursors,
              fieldIndexRef,
              matchDurationMinutes,
              breakDurationMinutes,
            )),
          );
        }
      }
      return allMatches;
    });
    return created.map((match) => toMatchSummary(match));
  }

  /**
   * Builds the slot definitions for one round of one bracket -- round 1
   * seeded with real opponents where known, placeholder-labeled slots
   * otherwise; later rounds always placeholder-labeled ("Vainqueur ..."),
   * plus a trailing 3rd-place slot when this round is the final and the
   * bracket has a ranking match. Pure (no DB access) so it can be called
   * per-round, letting the caller interleave rounds across several
   * brackets instead of finishing one bracket before starting the next.
   */
  private buildRoundSlotDefs(
    bracket: BracketWithPhase,
    slots: QualificationSlot[],
    round: number,
  ): SlotDef[] {
    const totalRounds = Math.log2(bracket.size);
    if (round === 1) {
      const order = seedOrder(bracket.size);
      return Array.from({ length: order.length / 2 }, (_, slot) => {
        const home = slots[order[slot * 2] - 1];
        const away = slots[order[slot * 2 + 1] - 1];
        return {
          round: 1,
          bracketSlot: slot,
          isThirdPlaceMatch: false,
          homeTeamId: home.teamId,
          awayTeamId: away.teamId,
          homeSourceLabel: home.teamId ? null : home.label,
          awaySourceLabel: away.teamId ? null : away.label,
        };
      });
    }

    const matchesInRound = bracket.size / 2 ** round;
    const previousRoundLabel = roundLabel(totalRounds - (round - 1));
    const slotDefs: SlotDef[] = [];
    for (let slot = 0; slot < matchesInRound; slot++) {
      slotDefs.push({
        round,
        bracketSlot: slot,
        isThirdPlaceMatch: false,
        homeTeamId: null,
        awayTeamId: null,
        homeSourceLabel: `Vainqueur ${previousRoundLabel} ${2 * slot + 1}`,
        awaySourceLabel: `Vainqueur ${previousRoundLabel} ${2 * slot + 2}`,
      });
    }
    if (round === totalRounds && bracket.hasRankingMatch) {
      const semifinalLabel = roundLabel(1);
      slotDefs.push({
        round,
        bracketSlot: 0,
        isThirdPlaceMatch: true,
        homeTeamId: null,
        awayTeamId: null,
        homeSourceLabel: `Perdant ${semifinalLabel} 1`,
        awaySourceLabel: `Perdant ${semifinalLabel} 2`,
      });
    }
    return slotDefs;
  }

  /**
   * Writes already-built slot definitions to the DB, scheduling them onto
   * `fieldIds` via the shared `fieldCursors`/`fieldIndexRef` when provided
   * (both threaded through by the caller across every round/bracket of a
   * single generation, so field rotation and per-field timing continue
   * correctly no matter how the caller batches its calls). Runs entirely
   * through `tx`, so a whole generation -- one bracket or several -- is
   * genuinely atomic: a failure partway through rolls back every
   * timeslot/match created so far, not just the current batch's.
   */
  private async createMatches(
    tx: Prisma.TransactionClient,
    bracket: BracketWithPhase,
    slotDefs: SlotDef[],
    fieldIds: string[] | undefined,
    fieldCursors: Map<string, Date> | undefined,
    fieldIndexRef: { current: number } | undefined,
    matchDurationMinutes: number,
    breakDurationMinutes: number,
  ): Promise<MatchWithRelations[]> {
    const slotDurationMs =
      (matchDurationMinutes + breakDurationMinutes) * 60_000;

    // Sequential on purpose -- an interactive Prisma transaction runs its
    // queries one at a time regardless, and the shared per-field cursor
    // (read then advanced before the next slot's timeslot is created) needs
    // to see each prior slot's advance in order.
    const matches: MatchWithRelations[] = [];
    for (const slotDef of slotDefs) {
      let timeSlotId: string | undefined;
      if (fieldIds?.length && fieldCursors && fieldIndexRef) {
        const fieldId = fieldIds[fieldIndexRef.current % fieldIds.length];
        fieldIndexRef.current += 1;
        const startTime = fieldCursors.get(fieldId)!;
        const endTime = new Date(
          startTime.getTime() + matchDurationMinutes * 60_000,
        );
        fieldCursors.set(
          fieldId,
          new Date(startTime.getTime() + slotDurationMs),
        );
        const timeSlot = await tx.timeSlot.create({
          data: { fieldId, startTime, endTime },
        });
        timeSlotId = timeSlot.id;
      }
      const match = await tx.match.create({
        data: {
          knockoutBracketId: bracket.id,
          round: slotDef.round,
          bracketSlot: slotDef.bracketSlot,
          isThirdPlaceMatch: slotDef.isThirdPlaceMatch,
          homeTeamId: slotDef.homeTeamId,
          awayTeamId: slotDef.awayTeamId,
          homeSourceLabel: slotDef.homeSourceLabel,
          awaySourceLabel: slotDef.awaySourceLabel,
          ...(timeSlotId && { timeSlotId }),
        },
        include: MATCH_INCLUDE,
      });
      matches.push(match);
    }
    return matches;
  }

  async listMatches(
    organizationId: string,
    tournamentId: string,
    bracketId: string,
  ) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    await this.getOrThrowForTournament(tournamentId, bracketId);
    const matches = await this.prisma.match.findMany({
      where: { knockoutBracketId: bracketId },
      include: MATCH_INCLUDE,
      orderBy: [{ round: 'asc' }, { bracketSlot: 'asc' }],
    });
    return matches.map((match) => toMatchSummary(match));
  }

  /**
   * Called after a knockout match's score is validated or it's forfeited.
   * Once every match in a round has a decided winner, seeds the next round
   * (and the 3rd-place match, if the bracket has one) from those winners —
   * a no-op if the round isn't finished yet, is already the final, or the
   * next round already exists (safe to call more than once per match).
   */
  async tryAdvanceRound(bracketId: string, round: number): Promise<void> {
    const bracket = await this.prisma.knockoutBracket.findUnique({
      where: { id: bracketId },
      include: { phase: { include: { category: true } } },
    });
    if (!bracket) {
      return;
    }
    const totalRounds = Math.log2(bracket.size);
    if (!Number.isInteger(totalRounds) || round >= totalRounds) {
      return;
    }

    const roundMatches = await this.prisma.match.findMany({
      where: { knockoutBracketId: bracketId, round, isThirdPlaceMatch: false },
      include: { score: true },
      orderBy: { bracketSlot: 'asc' },
    });
    if (roundMatches.length === 0) {
      return;
    }
    const outcomes = roundMatches.map((match) => ({
      match,
      winnerTeamId: getWinnerTeamId(match),
    }));
    if (outcomes.some((outcome) => outcome.winnerTeamId === null)) {
      return;
    }

    const nextRound = round + 1;

    // generateMatches now creates every round up front, including this one,
    // as null-team placeholders -- so "does it exist" no longer means
    // "already advanced". What does: any of them already has a team
    // assigned (this function is safe to call more than once per match, and
    // must be a no-op on repeat calls once it's already filled these in).
    const nextRoundMatches = await this.prisma.match.findMany({
      where: { knockoutBracketId: bracketId, round: nextRound },
      orderBy: { bracketSlot: 'asc' },
    });
    if (
      nextRoundMatches.length === 0 ||
      nextRoundMatches.some(
        (match) => match.homeTeamId !== null || match.awayTeamId !== null,
      )
    ) {
      return;
    }

    const isSemifinalRound = nextRound === totalRounds;
    const updated: string[] = [];
    for (let i = 0; i < outcomes.length; i += 2) {
      const home = outcomes[i];
      const away = outcomes[i + 1];
      const slot = i / 2;

      const match = nextRoundMatches.find(
        (m) => m.bracketSlot === slot && !m.isThirdPlaceMatch,
      );
      if (match) {
        await this.prisma.match.update({
          where: { id: match.id },
          data: {
            homeTeamId: home.winnerTeamId,
            awayTeamId: away.winnerTeamId,
            homeSourceLabel: null,
            awaySourceLabel: null,
          },
        });
        updated.push(match.id);
      }
      if (isSemifinalRound && bracket.hasRankingMatch) {
        const rankingMatch = nextRoundMatches.find(
          (m) => m.bracketSlot === slot && m.isThirdPlaceMatch,
        );
        if (rankingMatch) {
          await this.prisma.match.update({
            where: { id: rankingMatch.id },
            data: {
              homeTeamId: getLoserTeamId(home.match),
              awayTeamId: getLoserTeamId(away.match),
              homeSourceLabel: null,
              awaySourceLabel: null,
            },
          });
          updated.push(rankingMatch.id);
        }
      }
    }
    for (const matchId of updated) {
      this.realtimeService.emit({
        tournamentId: bracket.phase.category.tournamentId,
        type: 'match-updated',
        matchId,
      });
    }
  }

  /**
   * Called after a pool match's score is validated or it's forfeited.
   * Mirrors tryAdvanceRound, but for round 1: once a pool becomes complete,
   * checks every knockout phase it feeds (directly via QualificationRule or
   * through a CrossGroupQualificationRule) for round-1 matches still
   * waiting on a placeholder, and fills them in for real once *every*
   * feeding pool is complete -- a no-op otherwise, and safe to call more
   * than once (already-resolved matches are simply skipped).
   */
  async tryResolveFirstRound(
    organizationId: string,
    tournamentId: string,
    groupId: string,
  ): Promise<void> {
    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { phaseId: true },
    });
    if (!group) {
      return;
    }
    const { isComplete } = await this.standingsService.getStandings(
      organizationId,
      tournamentId,
      groupId,
    );
    if (!isComplete) {
      return;
    }

    const [directTargets, crossGroupTargets] = await Promise.all([
      this.prisma.qualificationRule.findMany({
        where: { group: { phaseId: group.phaseId } },
        select: { targetPhaseId: true },
        distinct: ['targetPhaseId'],
      }),
      this.prisma.crossGroupQualificationRule.findMany({
        where: { phaseId: group.phaseId },
        select: { targetPhaseId: true },
        distinct: ['targetPhaseId'],
      }),
    ]);
    const targetPhaseIds = [
      ...new Set([
        ...directTargets.map((rule) => rule.targetPhaseId),
        ...crossGroupTargets.map((rule) => rule.targetPhaseId),
      ]),
    ];

    for (const targetPhaseId of targetPhaseIds) {
      const bracket = await this.prisma.knockoutBracket.findUnique({
        where: { phaseId: targetPhaseId },
        include: { phase: { include: { category: true } } },
      });
      if (!bracket) {
        continue;
      }
      const pendingMatches = await this.prisma.match.findMany({
        where: {
          knockoutBracketId: bracket.id,
          round: 1,
          OR: [{ homeTeamId: null }, { awayTeamId: null }],
        },
        orderBy: { bracketSlot: 'asc' },
      });
      if (pendingMatches.length === 0) {
        continue;
      }

      const slots = await this.resolveQualificationSlots(
        organizationId,
        tournamentId,
        targetPhaseId,
      );
      if (
        slots.length !== bracket.size ||
        slots.some((slot) => slot.teamId === null)
      ) {
        continue;
      }

      const order = seedOrder(bracket.size);
      for (const match of pendingMatches) {
        const slotIndex = match.bracketSlot ?? 0;
        const home = slots[order[slotIndex * 2] - 1];
        const away = slots[order[slotIndex * 2 + 1] - 1];
        await this.prisma.match.update({
          where: { id: match.id },
          data: {
            homeTeamId: home.teamId,
            awayTeamId: away.teamId,
            homeSourceLabel: null,
            awaySourceLabel: null,
          },
        });
        this.realtimeService.emit({
          tournamentId: bracket.phase.category.tournamentId,
          type: 'match-updated',
          matchId: match.id,
        });
      }
    }
  }

  /**
   * Enumerates every bracket slot a target phase's qualification rules
   * define, in a fixed canonical order matching `seedOrder`'s indexing --
   * `label` is always computable from the rules alone (e.g. "1er Poule A"),
   * `teamId` is only populated once the slot's source pool(s) are complete
   * (StandingsService.isComplete). A slot never appears with the wrong
   * team: until every pool feeding it is done, `teamId` stays null and only
   * `label` is shown.
   */
  private async resolveQualificationSlots(
    organizationId: string,
    tournamentId: string,
    targetPhaseId: string,
  ): Promise<QualificationSlot[]> {
    const rules = await this.prisma.qualificationRule.findMany({
      where: { targetPhaseId },
      include: { group: { select: { name: true } } },
    });

    const standingsByGroupId = new Map<
      string,
      Awaited<ReturnType<StandingsService['getStandings']>>
    >();
    for (const rule of rules) {
      if (!standingsByGroupId.has(rule.groupId)) {
        standingsByGroupId.set(
          rule.groupId,
          await this.standingsService.getStandings(
            organizationId,
            tournamentId,
            rule.groupId,
          ),
        );
      }
    }

    const directSlots: {
      position: number;
      groupName: string;
      teamId: string | null;
    }[] = [];
    for (const rule of rules) {
      const { rows, isComplete, unresolvedTies } = standingsByGroupId.get(
        rule.groupId,
      )!;
      // A position inside a still-unresolved tie (StandingsController's
      // tie-break-choice endpoint) keeps its team withheld too, even though
      // the pool itself is complete -- exactly *which* team currently sits
      // there is a coin flip (the alphabetical fallback) until the
      // organizer picks.
      const tiedPositions = new Set(
        unresolvedTies.flatMap((tie) =>
          tie.teams
            .map((team) => rows.find((row) => row.teamId === team.id)?.position)
            .filter((position): position is number => position !== undefined),
        ),
      );
      for (
        let position = rule.fromPosition;
        position <= rule.toPosition;
        position++
      ) {
        const teamId =
          isComplete && !tiedPositions.has(position)
            ? (rows.find((row) => row.position === position)?.teamId ?? null)
            : null;
        directSlots.push({ position, groupName: rule.group.name, teamId });
      }
    }
    directSlots.sort(
      (a, b) =>
        a.position - b.position || a.groupName.localeCompare(b.groupName),
    );
    const directQualificationSlots: QualificationSlot[] = directSlots.map(
      (slot) => ({
        teamId: slot.teamId,
        label: `${ordinal(slot.position)} ${slot.groupName}`,
      }),
    );

    // Best-of-position cross-group qualifiers (e.g. "8 best 3rd places") join
    // after every direct per-group qualifier, in their own inter-pool rank
    // order -- they're a distinct tier on top of, not interleaved with, the
    // regular position-range qualifiers above.
    const crossGroupSlots =
      await this.crossGroupQualificationRulesService.resolveSlots(
        organizationId,
        tournamentId,
        targetPhaseId,
      );

    return [...directQualificationSlots, ...crossGroupSlots];
  }

  private async assertFieldsBelongToTournament(
    tournamentId: string,
    fieldIds: string[],
  ): Promise<void> {
    const fields = await this.prisma.field.findMany({
      where: { id: { in: fieldIds }, venue: { tournamentId } },
    });
    if (fields.length !== new Set(fieldIds).size) {
      throw new BadRequestException(
        "Un ou plusieurs terrains n'appartiennent pas à ce tournoi.",
      );
    }
  }

  private async getOrThrowForTournament(
    tournamentId: string,
    bracketId: string,
  ): Promise<BracketWithPhase> {
    const bracket = await this.prisma.knockoutBracket.findUnique({
      where: { id: bracketId },
      include: { phase: { include: { category: true } } },
    });
    if (!bracket || bracket.phase.category.tournamentId !== tournamentId) {
      throw new NotFoundException('Tableau introuvable.');
    }
    return bracket;
  }
}
