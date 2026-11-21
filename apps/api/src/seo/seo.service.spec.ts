import { ConfigService } from '@nestjs/config';
import { TournamentStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SeoService } from './seo.service';

describe('SeoService', () => {
  const findMany = jest.fn();
  const prisma = { tournament: { findMany } } as unknown as PrismaService;
  const config = {
    get: () => 'https://tournarena.com/',
  } as unknown as ConfigService;
  const service = new SeoService(prisma, config);

  beforeEach(() => findMany.mockReset());

  it('lists the static pages and every published, listed tournament', async () => {
    findMany.mockResolvedValue([
      { slug: 'coupe-a&b', updatedAt: new Date('2026-11-02T10:00:00Z') },
    ]);

    const xml = await service.sitemap();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: TournamentStatus.PUBLISHED, isListed: true },
      }),
    );
    expect(xml).toContain('<loc>https://tournarena.com/</loc>');
    expect(xml).toContain('<loc>https://tournarena.com/decouvrir</loc>');
    expect(xml).toContain(
      '<loc>https://tournarena.com/coupe-a%26b</loc><lastmod>2026-11-02</lastmod>',
    );
    expect(xml).not.toContain('/admin');
  });
});
