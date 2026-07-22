import { PrismaService } from '../prisma/prisma.service';
import { SportsService } from './sports.service';

describe('SportsService', () => {
  it('lists sports sorted by name, without extra fields', async () => {
    const prisma = {
      sport: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sport-1',
            name: 'Basketball',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'sport-2',
            name: 'Football',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      },
    };
    const service = new SportsService(prisma as unknown as PrismaService);

    const result = await service.list();

    expect(prisma.sport.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
    });
    expect(result).toEqual([
      { id: 'sport-1', name: 'Basketball' },
      { id: 'sport-2', name: 'Football' },
    ]);
  });
});
