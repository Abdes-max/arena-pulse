import { Match } from '../../generated/prisma/client';

export type MatchWithRelations = Match & {
  homeTeam: { id: string; name: string } | null;
  awayTeam: { id: string; name: string } | null;
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
};

export const MATCH_INCLUDE = {
  homeTeam: { select: { id: true, name: true } },
  awayTeam: { select: { id: true, name: true } },
  timeSlot: {
    include: { field: { select: { id: true, name: true } } },
  },
  officials: {
    include: {
      referee: { select: { id: true, firstName: true, lastName: true } },
      refereeingTeam: { select: { id: true, name: true } },
    },
  },
} as const;

export function toMatchSummary(match: MatchWithRelations) {
  return {
    id: match.id,
    groupId: match.groupId,
    round: match.round,
    status: match.status,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
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
  };
}
