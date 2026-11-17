import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  ClubDirectoryService,
  toGouvSuggestions,
} from './club-directory.service';

const config = {
  get: (_key: string, fallback?: string) => fallback,
} as unknown as ConfigService;

const SEPTEMES = {
  code: '553079',
  name: 'FC Septemes Consolat',
  shortName: null,
  city: 'Septemes Les Vallons',
  postalCode: '13240',
  department: '13',
};

describe('toGouvSuggestions', () => {
  it('puts football-looking names first and keeps the register order otherwise', () => {
    const results = toGouvSuggestions([
      { siren: '111111111', nom_complet: 'AIX TENNIS CLUB' },
      {
        siren: '453133209',
        nom_complet: 'AIX UNIVERSITE CLUB FOOTBALL (AUCF)',
        siege: { libelle_commune: 'AIX-EN-PROVENCE', code_postal: '13100' },
      },
      { siren: '222222222', nom_complet: 'AIX NATATION' },
    ]);
    expect(results.map((r) => r.externalId)).toEqual([
      'siren:453133209',
      'siren:111111111',
      'siren:222222222',
    ]);
    expect(results[0]).toEqual({
      source: 'siren',
      externalId: 'siren:453133209',
      name: 'AIX UNIVERSITE CLUB FOOTBALL (AUCF)',
      city: 'AIX-EN-PROVENCE',
      postalCode: '13100',
      department: null,
      logoUrl: null,
    });
  });

  it('drops duplicates and entries without a valid SIREN or name', () => {
    expect(
      toGouvSuggestions([
        { siren: '453133209', nom_complet: 'AUCF' },
        { siren: '453133209', nom_complet: 'AUCF' },
        { siren: '12', nom_complet: 'X' },
        { siren: '333333333' },
      ]),
    ).toHaveLength(1);
  });
});

describe('ClubDirectoryService', () => {
  let prisma: {
    fffClub: { count: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock };
  };
  let fetchMock: jest.SpyInstance;
  let service: ClubDirectoryService;

  beforeEach(() => {
    prisma = {
      fffClub: { count: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
    };
    fetchMock = jest.spyOn(global, 'fetch');
    service = new ClubDirectoryService(
      prisma as unknown as PrismaService,
      config,
    );
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('does not search for fewer than 3 characters', async () => {
    await expect(service.search('fc')).resolves.toEqual([]);
    expect(prisma.fffClub.count).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('searches the FFF directory word by word once it is loaded, with the crest', async () => {
    prisma.fffClub.count.mockResolvedValue(14000);
    prisma.fffClub.findMany.mockResolvedValue([SEPTEMES]);

    const results = await service.search('consolat  septemes');

    expect(results).toEqual([
      {
        source: 'fff',
        externalId: 'fff:553079',
        name: 'FC Septemes Consolat',
        city: 'Septemes Les Vallons',
        postalCode: '13240',
        department: '13',
        logoUrl: '/api/v1/club-directory/logos/553079',
      },
    ]);
    const [[args]] = prisma.fffClub.findMany.mock.calls as [
      [{ where: { AND: unknown[] } }],
    ];
    const where = args.where;
    expect(where.AND).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the company register while the directory is empty, then serves from cache', async () => {
    prisma.fffClub.count.mockResolvedValue(0);
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { siren: '453133209', nom_complet: 'AIX UNIVERSITE CLUB FOOTBALL' },
          ],
        }),
        { status: 200 },
      ),
    );

    const first = await service.search('aix football');
    const second = await service.search('Aix Football ');

    expect(first).toHaveLength(1);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain('q=aix%20football&activite_principale=93.12Z');
  });

  it('reports an unavailable register as a 502', async () => {
    prisma.fffClub.count.mockResolvedValue(0);
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(service.search('aix football')).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it('builds a crest URL only for FFF clubs', () => {
    expect(service.logoUrlForExternalId('fff:553079')).toBe(
      'https://cdn-transverse.azureedge.net/phlogos/BC553079.jpg',
    );
    expect(service.logoUrlForExternalId('siren:453133209')).toBeNull();
    expect(service.logoUrlForExternalId('fff:../x')).toBeNull();
  });

  it('serves crests only for clubs of the directory, never as an open proxy', async () => {
    prisma.fffClub.findUnique.mockResolvedValue(null);

    await expect(service.crest('../../etc')).resolves.toBeNull();
    await expect(service.crest('99999999')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.fffClub.findUnique).toHaveBeenCalledWith({
      where: { code: '99999999' },
    });
  });
});
