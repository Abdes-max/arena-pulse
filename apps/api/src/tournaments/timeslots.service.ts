import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TimeSlot } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTimeSlotDto } from './dto/create-timeslot.dto';
import { UpdateTimeSlotDto } from './dto/update-timeslot.dto';
import { FieldsService } from './fields.service';
import { MoveScheduleItemDto } from './dto/move-schedule-item.dto';
import {
  MATCH_TOURNAMENT_INCLUDE,
  matchBelongsToTournament,
} from './match-ownership.util';
import { reflowMove, SlotTimes } from './schedule-reflow.util';
import { timeRangesOverlap } from './time-overlap.util';
import { TournamentsService } from './tournaments.service';

@Injectable()
export class TimeSlotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly fieldsService: FieldsService,
  ) {}

  async create(
    organizationId: string,
    tournamentId: string,
    fieldId: string,
    dto: CreateTimeSlotDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.fieldsService.assertFieldExists(tournamentId, fieldId);
    const startTime = new Date(dto.startTime);
    const endTime = new Date(dto.endTime);
    this.assertValidRange(startTime, endTime);
    await this.assertNoFieldOverlap(fieldId, startTime, endTime);

    const timeSlot = await this.prisma.timeSlot.create({
      data: { fieldId, startTime, endTime, label: dto.label },
    });
    return this.toSummary(timeSlot);
  }

  async list(organizationId: string, tournamentId: string, fieldId: string) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    await this.fieldsService.assertFieldExists(tournamentId, fieldId);
    const timeSlots = await this.prisma.timeSlot.findMany({
      where: { fieldId },
      orderBy: { startTime: 'asc' },
    });
    return timeSlots.map((timeSlot) => this.toSummary(timeSlot));
  }

  async update(
    organizationId: string,
    tournamentId: string,
    timeSlotId: string,
    dto: UpdateTimeSlotDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const timeSlot = await this.getOrThrowForTournament(
      tournamentId,
      timeSlotId,
    );
    const startTime = dto.startTime
      ? new Date(dto.startTime)
      : timeSlot.startTime;
    const endTime = dto.endTime ? new Date(dto.endTime) : timeSlot.endTime;
    this.assertValidRange(startTime, endTime);
    await this.assertNoFieldOverlap(
      timeSlot.fieldId,
      startTime,
      endTime,
      timeSlotId,
    );

    const updated = await this.prisma.timeSlot.update({
      where: { id: timeSlotId },
      data: { startTime, endTime, label: dto.label },
    });
    return this.toSummary(updated);
  }

  /**
   * Drag & drop in the calendar: puts a slot (or a match, with its slot) at a
   * position of a field's column and shifts the following slots, on the
   * column it leaves as on the one it joins. All or nothing: refused if a
   * team would end up playing two matches at once (any field, any phase).
   */
  async moveWithReflow(
    organizationId: string,
    tournamentId: string,
    dto: MoveScheduleItemDto,
  ): Promise<void> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.fieldsService.assertFieldExists(tournamentId, dto.fieldId);

    const all = await this.prisma.timeSlot.findMany({
      where: { field: { venue: { tournamentId } } },
      include: {
        match: {
          select: {
            id: true,
            homeTeamId: true,
            awayTeamId: true,
            homeTeam: { select: { id: true, name: true } },
            awayTeam: { select: { id: true, name: true } },
          },
        },
      },
    });

    let moving: (typeof all)[number] | null = null;
    let unscheduledMatch: {
      id: string;
      homeTeamId: string | null;
      awayTeamId: string | null;
      homeTeam: { id: string; name: string } | null;
      awayTeam: { id: string; name: string } | null;
    } | null = null;
    if (dto.timeSlotId) {
      const found = all.find((slot) => slot.id === dto.timeSlotId);
      if (!found) {
        throw new NotFoundException('Créneau introuvable.');
      }
      moving = found;
    } else if (dto.matchId) {
      const match = await this.prisma.match.findUnique({
        where: { id: dto.matchId },
        include: {
          ...MATCH_TOURNAMENT_INCLUDE,
          homeTeam: { select: { id: true, name: true } },
          awayTeam: { select: { id: true, name: true } },
        },
      });
      if (!match || !matchBelongsToTournament(match, tournamentId)) {
        throw new NotFoundException('Match introuvable.');
      }
      const found = all.find((slot) => slot.id === match.timeSlotId);
      if (found) {
        moving = found;
      } else {
        unscheduledMatch = match;
      }
    } else {
      throw new BadRequestException('Fournir timeSlotId ou matchId.');
    }

    const lengthMs = moving
      ? moving.endTime.getTime() - moving.startTime.getTime()
      : (dto.minutes ?? 30) * 60_000;
    const byField = new Map<string, SlotTimes[]>();
    for (const slot of all) {
      const list = byField.get(slot.fieldId) ?? [];
      list.push({
        id: slot.id,
        fieldId: slot.fieldId,
        start: slot.startTime,
        end: slot.endTime,
      });
      byField.set(slot.fieldId, list);
    }
    const earliest = all
      .map((slot) => slot.startTime)
      .sort((a, b) => a.getTime() - b.getTime())[0];
    const changes = reflowMove(
      byField,
      {
        id: moving?.id ?? null,
        fieldId: moving?.fieldId ?? null,
        start: moving?.startTime ?? null,
        lengthMs,
      },
      dto.fieldId,
      dto.index,
      earliest ?? new Date(),
    );

    // Team check on the new times.
    type Placed = {
      slotId: string | null;
      start: Date;
      end: Date;
      match: NonNullable<(typeof all)[number]['match']>;
    };
    const placed: Placed[] = [];
    for (const slot of all) {
      if (!slot.match) {
        continue;
      }
      const change = changes.get(slot.id);
      placed.push({
        slotId: slot.id,
        start: change?.start ?? slot.startTime,
        end: change?.end ?? slot.endTime,
        match: slot.match,
      });
    }
    if (unscheduledMatch) {
      const change = changes.get(null)!;
      placed.push({
        slotId: null,
        start: change.start,
        end: change.end,
        match: unscheduledMatch,
      });
    }
    const changed = (p: Placed) => changes.has(p.slotId);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i];
        const b = placed[j];
        if (!changed(a) && !changed(b)) {
          continue;
        }
        if (!timeRangesOverlap(a.start, a.end, b.start, b.end)) {
          continue;
        }
        const shared = [a.match.homeTeam, a.match.awayTeam].find(
          (team) =>
            team &&
            (team.id === b.match.homeTeamId || team.id === b.match.awayTeamId),
        );
        if (shared) {
          throw new ConflictException(
            `« ${shared.name} » jouerait deux matchs en même temps. Déplacement annulé.`,
          );
        }
      }
    }

    const updates = [...changes.entries()]
      .filter(([id]) => id !== null)
      .map(([id, change]) =>
        this.prisma.timeSlot.update({
          where: { id: id! },
          data: {
            fieldId: change.fieldId,
            startTime: change.start,
            endTime: change.end,
          },
        }),
      );
    await this.prisma.$transaction(updates);
    if (unscheduledMatch) {
      const change = changes.get(null)!;
      const created = await this.prisma.timeSlot.create({
        data: {
          fieldId: change.fieldId,
          startTime: change.start,
          endTime: change.end,
        },
      });
      await this.prisma.match.update({
        where: { id: unscheduledMatch.id },
        data: { timeSlotId: created.id },
      });
    }
  }

  async remove(
    organizationId: string,
    tournamentId: string,
    timeSlotId: string,
  ): Promise<void> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.getOrThrowForTournament(tournamentId, timeSlotId);
    await this.prisma.timeSlot.delete({ where: { id: timeSlotId } });
  }

  private async getOrThrowForTournament(
    tournamentId: string,
    timeSlotId: string,
  ): Promise<TimeSlot> {
    const timeSlot = await this.prisma.timeSlot.findUnique({
      where: { id: timeSlotId },
      include: { field: { include: { venue: true } } },
    });
    if (!timeSlot || timeSlot.field.venue.tournamentId !== tournamentId) {
      throw new NotFoundException('Créneau introuvable.');
    }
    return timeSlot;
  }

  private assertValidRange(startTime: Date, endTime: Date): void {
    if (endTime <= startTime) {
      throw new BadRequestException(
        'La fin du créneau doit être après son début.',
      );
    }
  }

  private async assertNoFieldOverlap(
    fieldId: string,
    startTime: Date,
    endTime: Date,
    excludingTimeSlotId?: string,
  ): Promise<void> {
    const others = await this.prisma.timeSlot.findMany({
      where: {
        fieldId,
        ...(excludingTimeSlotId ? { id: { not: excludingTimeSlotId } } : {}),
      },
    });
    const overlaps = others.some((other) =>
      timeRangesOverlap(startTime, endTime, other.startTime, other.endTime),
    );
    if (overlaps) {
      throw new ConflictException(
        'Ce créneau chevauche un autre créneau existant sur ce terrain.',
      );
    }
  }

  private toSummary(timeSlot: TimeSlot) {
    return {
      id: timeSlot.id,
      fieldId: timeSlot.fieldId,
      startTime: timeSlot.startTime,
      endTime: timeSlot.endTime,
      label: timeSlot.label,
    };
  }
}
