import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Category,
  CompetitionPhase,
  KnockoutBracket,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isPowerOfTwo, seedOrder } from './bracket-seeding.util';
import { GenerateBracketMatchesDto } from './dto/generate-bracket-matches.dto';
import { getLoserTeamId, getWinnerTeamId } from './match-outcome.util';
import { MATCH_INCLUDE, toMatchSummary } from './match-summary.util';
import { RealtimeService } from './realtime.service';
import { StandingsService } from './standings.service';
import { TournamentsService } from './tournaments.service';

type BracketWithPhase = KnockoutBracket & {
  phase: CompetitionPhase & { category: Category };
};

interface QualifiedEntry {
  teamId: string;
  position: number;
  groupName: string;
}

@Injectable()
export class BracketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly standingsService: StandingsService,
    private readonly realtimeService: RealtimeService,
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

    const qualified = await this.collectQualifiedTeams(
      organizationId,
      tournamentId,
      bracket.phaseId,
    );
    if (qualified.length !== bracket.size) {
      throw new BadRequestException(
        `Ce tableau attend ${bracket.size} équipes qualifiées ; ${qualified.length} sont disponibles pour l'instant.`,
      );
    }

    // Every round is created now, in one go -- not just round 1. Rounds
    // after the first have no real opponents yet (their winners aren't
    // decided), so those matches start with null home/away teams; the
    // Scores page filters those out until tryAdvanceRound fills them in,
    // but they still occupy a real calendar slot from the start if fields
    // were chosen, which is the whole point: the organizer can plan the
    // full day (quarters, semis, final) up front.
    const totalRounds = Math.log2(bracket.size);
    const order = seedOrder(bracket.size);
    const slotDefs: {
      round: number;
      bracketSlot: number;
      isThirdPlaceMatch: boolean;
      homeTeamId: string | null;
      awayTeamId: string | null;
    }[] = Array.from({ length: order.length / 2 }, (_, slot) => ({
      round: 1,
      bracketSlot: slot,
      isThirdPlaceMatch: false,
      homeTeamId: qualified[order[slot * 2] - 1].teamId,
      awayTeamId: qualified[order[slot * 2 + 1] - 1].teamId,
    }));
    for (let round = 2; round <= totalRounds; round++) {
      const matchesInRound = bracket.size / 2 ** round;
      for (let slot = 0; slot < matchesInRound; slot++) {
        slotDefs.push({
          round,
          bracketSlot: slot,
          isThirdPlaceMatch: false,
          homeTeamId: null,
          awayTeamId: null,
        });
      }
      if (round === totalRounds && bracket.hasRankingMatch) {
        slotDefs.push({
          round,
          bracketSlot: 0,
          isThirdPlaceMatch: true,
          homeTeamId: null,
          awayTeamId: null,
        });
      }
    }

    // Optional -- schedules every one of the slots above onto these fields,
    // continuing the same field rotation across all rounds.
    const timeSlotIds = dto.fieldIds?.length
      ? await this.scheduleAllRounds(
          tournamentId,
          bracket,
          dto,
          slotDefs.length,
        )
      : slotDefs.map(() => null);

    const created = await this.prisma.$transaction(
      slotDefs.map((slotDef, index) =>
        this.prisma.match.create({
          data: {
            knockoutBracketId: bracketId,
            round: slotDef.round,
            bracketSlot: slotDef.bracketSlot,
            isThirdPlaceMatch: slotDef.isThirdPlaceMatch,
            homeTeamId: slotDef.homeTeamId,
            awayTeamId: slotDef.awayTeamId,
            ...(timeSlotIds[index] && { timeSlotId: timeSlotIds[index] }),
          },
          include: MATCH_INCLUDE,
        }),
      ),
    );
    return created.map((match) => toMatchSummary(match));
  }

  private async scheduleAllRounds(
    tournamentId: string,
    bracket: BracketWithPhase,
    dto: GenerateBracketMatchesDto,
    slotCount: number,
  ): Promise<string[]> {
    const fieldIds = dto.fieldIds!;
    if (!dto.startDateTime) {
      throw new BadRequestException(
        'Une date de début est requise pour planifier ce tableau sur des terrains.',
      );
    }
    const fields = await this.prisma.field.findMany({
      where: { id: { in: fieldIds }, venue: { tournamentId } },
    });
    if (fields.length !== new Set(fieldIds).size) {
      throw new BadRequestException(
        "Un ou plusieurs terrains n'appartiennent pas à ce tournoi.",
      );
    }

    const matchDurationMinutes =
      dto.matchDurationMinutes ?? bracket.phase.matchDurationMinutes;
    const breakDurationMinutes =
      dto.breakDurationMinutes ?? bracket.phase.breakDurationMinutes;
    const slotDurationMs =
      (matchDurationMinutes + breakDurationMinutes) * 60_000;
    const fieldCursors = new Map<string, Date>(
      fieldIds.map((fieldId) => [fieldId, new Date(dto.startDateTime!)]),
    );

    // Sequential on purpose: each iteration reads then advances the shared
    // per-field cursor before its own `await`, the same way
    // ScheduleGenerationService schedules round-robin fixtures -- Promise.all
    // still parallelizes the actual DB writes since .map() invokes every
    // callback synchronously up to its first await before any of them settle.
    return Promise.all(
      Array.from({ length: slotCount }, async (_, index) => {
        const fieldId = fieldIds[index % fieldIds.length];
        const startTime = fieldCursors.get(fieldId)!;
        const endTime = new Date(
          startTime.getTime() + matchDurationMinutes * 60_000,
        );
        fieldCursors.set(
          fieldId,
          new Date(startTime.getTime() + slotDurationMs),
        );
        const timeSlot = await this.prisma.timeSlot.create({
          data: { fieldId, startTime, endTime },
        });
        return timeSlot.id;
      }),
    );
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

  private async collectQualifiedTeams(
    organizationId: string,
    tournamentId: string,
    targetPhaseId: string,
  ): Promise<QualifiedEntry[]> {
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

    const entries: QualifiedEntry[] = [];
    for (const rule of rules) {
      const { rows } = standingsByGroupId.get(rule.groupId)!;
      for (const row of rows) {
        if (
          row.position >= rule.fromPosition &&
          row.position <= rule.toPosition
        ) {
          entries.push({
            teamId: row.teamId,
            position: row.position,
            groupName: rule.group.name,
          });
        }
      }
    }
    entries.sort(
      (a, b) =>
        a.position - b.position || a.groupName.localeCompare(b.groupName),
    );
    return entries;
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
