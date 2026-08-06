import { Match } from '../../generated/prisma/client';

export type MatchWithRelations = Match & {
  homeTeam: { id: string; name: string } | null;
  awayTeam: { id: string; name: string } | null;
  forfeitedTeam: { id: string; name: string } | null;
  timeSlot: {
    id: string;
    startTime: Date;
    endTime: Date;
    field: { id: string; name: string };
  } | null;
  officials: {
    id: string;
    referee: { id: string; firstName: string; lastName: string } | null;
    refereeingTeam: { id: string; name: string } | null;
  }[];
  score: {
    homeScore: number;
    awayScore: number;
    homePenaltyScore: number | null;
    awayPenaltyScore: number | null;
    isValidated: boolean;
    validatedAt: Date | null;
  } | null;
};

export const MATCH_INCLUDE = {
  homeTeam: { select: { id: true, name: true } },
  awayTeam: { select: { id: true, name: true } },
  forfeitedTeam: { select: { id: true, name: true } },
  timeSlot: {
    include: { field: { select: { id: true, name: true } } },
  },
  officials: {
    include: {
      referee: { select: { id: true, firstName: true, lastName: true } },
      refereeingTeam: { select: { id: true, name: true } },
    },
  },
  score: {
    select: {
      homeScore: true,
      awayScore: true,
      homePenaltyScore: true,
      awayPenaltyScore: true,
      isValidated: true,
      validatedAt: true,
    },
  },
} as const;

export function toMatchSummary(match: MatchWithRelations) {
  return {
    id: match.id,
    groupId: match.groupId,
    knockoutBracketId: match.knockoutBracketId,
    bracketSlot: match.bracketSlot,
    isThirdPlaceMatch: match.isThirdPlaceMatch,
    round: match.round,
    status: match.status,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    homeSourceLabel: match.homeTeam ? null : match.homeSourceLabel,
    awaySourceLabel: match.awayTeam ? null : match.awaySourceLabel,
    forfeitedTeam: match.forfeitedTeam,
    timeSlot: match.timeSlot
      ? {
          id: match.timeSlot.id,
          startTime: match.timeSlot.startTime,
          endTime: match.timeSlot.endTime,
          field: match.timeSlot.field,
        }
      : null,
    officials: match.officials.map((official) => ({
      id: official.id,
      referee: official.referee,
      refereeingTeam: official.refereeingTeam,
    })),
    score: match.score,
  };
}
