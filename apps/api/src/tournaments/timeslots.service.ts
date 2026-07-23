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
