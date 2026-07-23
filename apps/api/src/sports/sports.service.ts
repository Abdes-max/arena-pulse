import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SportsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const sports = await this.prisma.sport.findMany({
      orderBy: { name: 'asc' },
    });
    return sports.map((sport) => ({ id: sport.id, name: sport.name }));
  }
}
