import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeocodingService, toSuggestions } from './geocoding.service';

const STADIUM = {
  geometry: { coordinates: [5.4475, 43.5297] as [number, number] },
  properties: {
    name: 'Stade Marius Requier',
    street: 'Avenue de la Molle',
    postcode: '13290',
    city: 'Aix-en-Provence',
    country: 'France',
  },
};

const STREET = {
  geometry: { coordinates: [2.35, 48.85] as [number, number] },
  properties: {
    name: 'Rue de Rivoli',
    housenumber: '12',
    street: 'Rue de Rivoli',
    postcode: '75001',
    city: 'Paris',
    country: 'France',
  },
};

describe('toSuggestions', () => {
  it('uses a place name as label and venue name, the address as detail', () => {
    expect(toSuggestions([STADIUM])).toEqual([
      {
        label: 'Stade Marius Requier',
        detail: 'Avenue de la Molle, 13290 Aix-en-Provence, France',
        name: 'Stade Marius Requier',
        address: 'Avenue de la Molle, 13290 Aix-en-Provence, France',
        lat: 43.5297,
        lon: 5.4475,
      },
    ]);
  });

  it('labels a plain street address by its number and street', () => {
    const [suggestion] = toSuggestions([STREET]);
    expect(suggestion.label).toBe('12 Rue de Rivoli');
    expect(suggestion.detail).toBe('75001 Paris, France');
    expect(suggestion.name).toBe('12 Rue de Rivoli, Paris');
  });

  it('drops duplicates and features without coordinates', () => {
    expect(
      toSuggestions([STADIUM, STADIUM, { properties: { name: 'X' } }]),
    ).toHaveLength(1);
  });
});

describe('GeocodingService', () => {
  const config = {
    get: (_key: string, fallback?: string) => fallback,
  } as unknown as ConfigService;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('does not call Photon for fewer than 3 characters', async () => {
    await expect(new GeocodingService(config).search('ab')).resolves.toEqual(
      [],
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('queries Photon once, then serves the same search from cache', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ features: [STADIUM] }), { status: 200 }),
    );
    const service = new GeocodingService(config);

    const first = await service.search('stade marius', 'fr');
    const second = await service.search('Stade Marius ', 'fr');

    expect(first).toHaveLength(1);
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain('q=stade%20marius&limit=6&lang=fr');
  });

  it('reports an unavailable provider as a 502', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(
      new GeocodingService(config).search('stade'),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});
