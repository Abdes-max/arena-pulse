import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CompetitionPhaseType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BracketsService } from './brackets.service';
import { RealtimeService } from './realtime.service';
import { TournamentsService } from './tournaments.service';

/**
 * The explicit "pool scores are final" step between the pools and the phases
 * they feed (the bracket). The bracket used to be filled the moment the last
 * pool match was validated, and never recalculated: a mistaken pool score
 * therefore froze a wrong draw. Now the organizer validates the pool phase
 * (which draws the bracket), can reopen it to fix a score, and validating
 * again redraws.
 */
@Injectable()
export class PhaseScoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly bracketsService: BracketsService,
    private readonly realtimeService: RealtimeService,
  ) {}

  /**
   * Throws unless a score can be entered on this match right now: a pool
   * match is locked once its phase is validated (reopen it first), and a
   * knockout match needs its two teams to be known, i.e. every pool feeding
   * it validated.
   */
  async assertMatchScorable(matchId: string): Promise<void> {
    const match = await this.prisma.match.findUnique({
      where: { id: matchId },
      select: {
        homeTeamId: true,
        awayTeamId: true,
        group: { select: { phase: { select: { scoresValidatedAt: true } } } },
        knockoutBracket: { select: { phaseId: true } },
      },
    });
    if (!match) {
      return;
    }
    if (match.group) {
      if (match.group.phase.scoresValidatedAt) {
        throw new ConflictException({
          message:
            'Les scores de la phase de poules sont validés. Cliquez sur « Modifier les scores » pour les rouvrir.',
          code: 'POOL_SCORES_VALIDATED',
        });
      }
      return;
    }
    if (match.knockoutBracket) {
      const sources = await this.sourcePhases(match.knockoutBracket.phaseId);
      const poolsPending = sources.some((phase) => !phase.scoresValidatedAt);
      if (poolsPending || !match.homeTeamId || !match.awayTeamId) {
        throw new ConflictException({
          message:
            'Les équipes de ce match ne sont pas encore connues : validez d’abord les scores de la phase de poules.',
          code: 'POOL_SCORES_NOT_VALIDATED',
        });
      }
    }
  }

  /** Locks the pool scores and draws the phases they feed. */
  async validatePoolScores(
    organizationId: string,
    tournamentId: string,
    phaseId: string,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const phase = await this.getPoolPhase(tournamentId, phaseId);
    const targetPhaseIds = await this.targetPhaseIds(phaseId);
    if (targetPhaseIds.length === 0) {
      throw new BadRequestException(
        'Cette phase n’alimente aucune phase finale : il n’y a rien à valider.',
      );
    }
    if (phase.scoresValidatedAt) {
      return { phaseId, scoresValidatedAt: phase.scoresValidatedAt };
    }

    const matches = await this.prisma.match.findMany({
      where: { group: { phaseId } },
      select: { status: true },
    });
    const unfinished = matches.filter(
      (match) => match.status !== 'COMPLETED' && match.status !== 'FORFEITED',
    ).length;
    if (matches.length === 0 || unfinished > 0) {
      throw new ConflictException({
        message:
          matches.length === 0
            ? 'Cette phase n’a aucun match.'
            : `Il reste ${unfinished} match${unfinished > 1 ? 's' : ''} de poule sans score validé.`,
        code: 'POOL_MATCHES_UNFINISHED',
      });
    }

    const updated = await this.prisma.competitionPhase.update({
      where: { id: phaseId },
      data: { scoresValidatedAt: new Date() },
    });

    // Draw the bracket once every pool feeding it is validated.
    let readyToDraw = true;
    for (const targetPhaseId of targetPhaseIds) {
      const sources = await this.sourcePhases(targetPhaseId);
      if (sources.some((source) => !source.scoresValidatedAt)) {
        readyToDraw = false;
      }
    }
    if (readyToDraw) {
      const groups = await this.prisma.group.findMany({
        where: { phaseId },
        select: { id: true },
      });
      for (const group of groups) {
        await this.bracketsService.tryResolveFirstRound(
          organizationId,
          tournamentId,
          group.id,
        );
      }
    }
    return { phaseId, scoresValidatedAt: updated.scoresValidatedAt };
  }

  /**
   * Reopens the pool scores so a mistake can be fixed: the phases they feed
   * go back to "teams to be determined", and the next validation redraws
   * them. Scores already entered in those phases no longer match the right
   * teams, so they are wiped, which needs `confirm` when there are any.
   */
  async reopenPoolScores(
    organizationId: string,
    tournamentId: string,
    phaseId: string,
    confirm: boolean,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const phase = await this.getPoolPhase(tournamentId, phaseId);
    if (!phase.scoresValidatedAt) {
      return { phaseId, scoresValidatedAt: null, resetMatches: 0 };
    }

    const targetPhaseIds = await this.targetPhaseIds(phaseId);
    const brackets = await this.prisma.knockoutBracket.findMany({
      where: { phaseId: { in: targetPhaseIds } },
      select: { id: true },
    });
    const bracketIds = brackets.map((bracket) => bracket.id);
    const withProgress = await this.prisma.match.count({
      where: {
        knockoutBracketId: { in: bracketIds },
        OR: [{ score: { isNot: null } }, { status: { not: 'SCHEDULED' } }],
      },
    });
    if (withProgress > 0 && !confirm) {
      throw new ConflictException({
        message: `${withProgress} match${withProgress > 1 ? 's' : ''} de la phase finale ${withProgress > 1 ? 'ont' : 'a'} déjà un score : ${withProgress > 1 ? 'ils seront effacés' : 'il sera effacé'} si vous modifiez les poules.`,
        code: 'KNOCKOUT_PROGRESS_EXISTS',
        count: withProgress,
      });
    }

    const resetMatchIds: string[] = [];
    for (const bracketId of bracketIds) {
      resetMatchIds.push(
        ...(await this.bracketsService.resetBracketToPlaceholders(
          organizationId,
          tournamentId,
          bracketId,
        )),
      );
    }
    await this.prisma.competitionPhase.update({
      where: { id: phaseId },
      data: { scoresValidatedAt: null },
    });
    for (const matchId of resetMatchIds) {
      this.realtimeService.emit({
        tournamentId,
        type: 'match-updated',
        matchId,
      });
    }
    return {
      phaseId,
      scoresValidatedAt: null,
      resetMatches: resetMatchIds.length,
    };
  }

  private async getPoolPhase(tournamentId: string, phaseId: string) {
    const phase = await this.prisma.competitionPhase.findFirst({
      where: { id: phaseId, category: { tournamentId } },
    });
    if (!phase) {
      throw new NotFoundException('Phase introuvable.');
    }
    if (phase.type !== CompetitionPhaseType.GROUP_STAGE || phase.isSeedPhase) {
      throw new BadRequestException(
        'Seule une phase de poules peut être validée.',
      );
    }
    return phase;
  }

  /** Phases (knockout) that this pool phase qualifies teams into. */
  private async targetPhaseIds(phaseId: string): Promise<string[]> {
    const [direct, crossGroup] = await Promise.all([
      this.prisma.qualificationRule.findMany({
        where: { group: { phaseId } },
        select: { targetPhaseId: true },
        distinct: ['targetPhaseId'],
      }),
      this.prisma.crossGroupQualificationRule.findMany({
        where: { phaseId },
        select: { targetPhaseId: true },
        distinct: ['targetPhaseId'],
      }),
    ]);
    return [
      ...new Set([
        ...direct.map((rule) => rule.targetPhaseId),
        ...crossGroup.map((rule) => rule.targetPhaseId),
      ]),
    ];
  }

  /** Real pool phases feeding a target phase (the fictitious seed phase of a no-pool format is never validated). */
  private async sourcePhases(targetPhaseId: string) {
    const [direct, crossGroup] = await Promise.all([
      this.prisma.qualificationRule.findMany({
        where: { targetPhaseId },
        select: { group: { select: { phaseId: true } } },
      }),
      this.prisma.crossGroupQualificationRule.findMany({
        where: { targetPhaseId },
        select: { phaseId: true },
      }),
    ]);
    const ids = [
      ...new Set([
        ...direct.map((rule) => rule.group.phaseId),
        ...crossGroup.map((rule) => rule.phaseId),
      ]),
    ];
    return this.prisma.competitionPhase.findMany({
      where: { id: { in: ids }, isSeedPhase: false },
      select: { id: true, scoresValidatedAt: true },
    });
  }
}
