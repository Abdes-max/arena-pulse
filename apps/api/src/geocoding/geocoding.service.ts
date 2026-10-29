import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** One address/place suggestion, ready to display and to save as a Venue. */
export interface AddressSuggestion {
  /** First line: the place's own name (stadium, gym...) or "12 rue X". */
  label: string;
  /** Second line: the rest of the address, for telling homonyms apart. */
  detail: string;
  /** Suggested Venue.name -- short enough for the public header. */
  name: string;
  /** Full postal address, saved as Venue.address. */
  address: string;
  lat: number;
  lon: number;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | undefined>;
}

const SUPPORTED_LANGS = new Set(['fr', 'en', 'de', 'it']);
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

/**
 * Address autocomplete for venues, backed by Photon (OpenStreetMap,
 * https://photon.komoot.io -- free, no API key, worldwide, knows stadiums
 * and gyms by name). Proxied through the API rather than called from the
 * browser: the web app's CSP only allows connect-src 'self', and a small
 * in-memory cache keeps us well within Photon's fair-use expectations.
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly cache = new Map<
    string,
    { at: number; results: AddressSuggestion[] }
  >();

  constructor(private readonly configService: ConfigService) {}

  async search(query: string, lang?: string): Promise<AddressSuggestion[]> {
    const q = query.trim();
    if (q.length < 3) {
      return [];
    }
    const language = lang && SUPPORTED_LANGS.has(lang) ? lang : 'fr';
    const key = `${language}:${q.toLowerCase()}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.results;
    }

    const baseUrl = this.configService.get<string>(
      'PHOTON_URL',
      'https://photon.komoot.io',
    );
    const url = `${baseUrl}/api/?q=${encodeURIComponent(q)}&limit=6&lang=${language}`;
    let features: PhotonFeature[];
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'TournArena (https://tournarena.com)' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        throw new Error(`Photon responded ${res.status}`);
      }
      features =
        ((await res.json()) as { features?: PhotonFeature[] }).features ?? [];
    } catch (error) {
      this.logger.warn(`Address search failed: ${(error as Error).message}`);
      throw new BadGatewayException(
        'Recherche d’adresse indisponible pour le moment.',
      );
    }

    const results = toSuggestions(features);
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      // Map keeps insertion order: the first key is the oldest entry.
      for (const oldest of this.cache.keys()) {
        this.cache.delete(oldest);
        break;
      }
    }
    this.cache.set(key, { at: Date.now(), results });
    return results;
  }
}

/** Photon GeoJSON features -> deduplicated display/save-ready suggestions. */
export function toSuggestions(features: PhotonFeature[]): AddressSuggestion[] {
  const seen = new Set<string>();
  const results: AddressSuggestion[] = [];
  for (const feature of features) {
    const p = feature.properties ?? {};
    const [lon, lat] = feature.geometry?.coordinates ?? [];
    if (lat === undefined || lon === undefined) {
      continue;
    }
    const streetLine = [p.housenumber, p.street].filter(Boolean).join(' ');
    const city = p.city ?? p.county ?? p.state ?? '';
    const cityLine = [p.postcode, city].filter(Boolean).join(' ');
    // Photon puts a street's own name in `name` too -- only a distinct one
    // is an actual place (stadium, gym, school...).
    const placeName = p.name && p.name !== p.street ? p.name : null;

    const label = placeName ?? streetLine ?? '';
    const mainLabel = label || cityLine || p.country || '';
    if (!mainLabel) {
      continue;
    }
    const detail = [placeName ? streetLine : null, cityLine, p.country]
      .filter((part) => !!part && part !== mainLabel)
      .join(', ');
    const address = [streetLine, cityLine, p.country]
      .filter(Boolean)
      .join(', ');
    const name = placeName
      ? placeName
      : [streetLine, city].filter(Boolean).join(', ') || mainLabel;

    const dedupeKey = `${mainLabel}|${detail}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    results.push({
      label: mainLabel,
      detail,
      name: name.slice(0, 200),
      address: (address || mainLabel).slice(0, 500),
      lat,
      lon,
    });
  }
  return results;
}
