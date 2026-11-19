import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { matchesImageMagicBytes } from '../common/utils/image-magic-bytes.util';
import { PrismaService } from '../prisma/prisma.service';

/** Sports with a club directory (the `sport` search parameter). */
export const CLUB_DIRECTORY_SPORTS = [
  'football',
  'basketball',
  'handball',
  'rugby',
  'volleyball',
  'tennis',
] as const;
export type ClubDirectorySport = (typeof CLUB_DIRECTORY_SPORTS)[number];

/** One club suggestion, ready to display and to link a Team/Tournament to. */
export interface ClubSuggestion {
  /**
   * "fff": our FffClub directory; "club": SportClub (other sports);
   * "siren": the State's company register (fallback while empty).
   */
  source: 'fff' | 'club' | 'siren';
  /**
   * Stable link kept on Team.externalClubId / Tournament.organizerClubId,
   * e.g. "fff:553079" or "club:handball:allauch-handball".
   */
  externalId: string;
  name: string;
  city: string | null;
  postalCode: string | null;
  /** Department code ("13"), when the city isn't known. */
  department: string | null;
  logoUrl: string | null;
}

interface GouvCompany {
  siren?: string;
  nom_complet?: string;
  siege?: { libelle_commune?: string; code_postal?: string };
}

type Crest = { data: Buffer; contentType: string };

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const MAX_RESULTS = 8;
const FFF_EXTERNAL_ID = /^fff:(\d{1,10})$/;
const CLUB_EXTERNAL_ID = /^club:([a-z]+):([a-z0-9-]{1,150})$/;
const SLUG = /^[a-z0-9-]{1,150}$/;
// Same domain as the FFF's own sites: club crests by affiliation number.
const DEFAULT_LOGO_TEMPLATE =
  'https://cdn-transverse.azureedge.net/phlogos/BC{id}.jpg';
// Only crests on SportCorico's media storage are fetched for SportClub --
// the URL comes from the sync, never from a client, but stays pinned anyway.
const SPORTCORICO_MEDIA = 'https://s3.pub2.infomaniak.cloud/';
// Our own crest route (ClubDirectoryController.logo): the web CSP only allows
// images from 'self', so the source CDNs are never hit by the browser directly.
const CREST_PATH = '/api/v1/club-directory/logos/';
const CREST_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_CREST_BYTES = 512 * 1024;
const CREST_REFRESH_MS = 90 * 24 * 60 * 60 * 1000;
const FOOTBALL_HINT = /foot|\bfc\b|\bas\b|\bus\b|\bes\b|olympique|sporting/i;

export function isClubDirectorySport(
  value: string,
): value is ClubDirectorySport {
  return (CLUB_DIRECTORY_SPORTS as readonly string[]).includes(value);
}

/**
 * Club search behind the team form's autocomplete and the tournament's
 * organizing club.
 *
 * The federations publish no open API, so the reference is our own tables:
 * FffClub for football (FFF affiliation number, crest on the FFF CDN) and
 * SportClub for basketball, handball, rugby, volleyball and tennis
 * (SportCorico's listings, used with their agreement), both kept in line by
 * prisma/sync-clubs.ts. Picking a club also brings its crest. While a
 * sport's table is empty, the search falls back to the State's company
 * register (recherche-entreprises.api.gouv.fr, free, no key), restricted to
 * sports clubs (NAF 93.12Z) -- just the name there, no crest.
 *
 * Proxied through the API like GeocodingService (the web app's CSP only
 * allows connect-src 'self'), with the same small in-memory cache.
 */
@Injectable()
export class ClubDirectoryService {
  private readonly logger = new Logger(ClubDirectoryService.name);
  private readonly cache = new Map<
    string,
    { at: number; results: ClubSuggestion[] }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async search(
    query: string,
    sport: string = 'football',
  ): Promise<ClubSuggestion[]> {
    if (!isClubDirectorySport(sport)) {
      throw new BadRequestException('Sport sans annuaire de clubs.');
    }
    const q = query.trim().replace(/\s+/g, ' ');
    if (q.length < 3) {
      return [];
    }
    const key = `${sport}:${q.toLowerCase()}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.results;
    }

    const results =
      sport === 'football'
        ? (await this.prisma.fffClub.count({ where: { dissolvedAt: null } })) >
          0
          ? await this.searchFff(q)
          : await this.searchGouv(q, sport)
        : (await this.prisma.sportClub.count({
              where: { sport, dissolvedAt: null },
            })) > 0
          ? await this.searchSportClubs(q, sport)
          : await this.searchGouv(q, sport);
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

  /**
   * Crest of a linked club (Team.externalClubId, Tournament.organizerClubId),
   * for TeamsService/TournamentsService to store as the logo -- same cached,
   * byte-sniffed image as the suggestions show (the FFF CDN labels PNGs
   * "image/jpg"). The URL is never taken from the client.
   */
  crestForExternalId(externalId: string): Promise<Crest | null> {
    const fff = FFF_EXTERNAL_ID.exec(externalId);
    if (fff) {
      return this.crest(fff[1]);
    }
    const club = CLUB_EXTERNAL_ID.exec(externalId);
    return club ? this.sportClubCrest(club[1], club[2]) : Promise.resolve(null);
  }

  /**
   * An FFF club's crest, fetched from the FFF CDN then kept under
   * UPLOADS_DIR/fff-logos. Only for clubs we know -- the route is public
   * (an <img> sends no token), so it must not become an open proxy. Null
   * when the club or its crest doesn't exist.
   */
  async crest(code: string): Promise<Crest | null> {
    if (!/^\d{1,10}$/.test(code)) {
      return null;
    }
    return this.cachedCrest(
      join(this.uploadsDir(), 'fff-logos'),
      code,
      async () =>
        (await this.prisma.fffClub.findUnique({ where: { code } }))
          ? this.logoUrlFor(code)
          : null,
    );
  }

  /** Same as crest() for a SportClub, cached under UPLOADS_DIR/club-logos/<sport>. */
  async sportClubCrest(sport: string, slug: string): Promise<Crest | null> {
    if (
      !isClubDirectorySport(sport) ||
      sport === 'football' ||
      !SLUG.test(slug)
    ) {
      return null;
    }
    return this.cachedCrest(
      join(this.uploadsDir(), 'club-logos', sport),
      slug,
      async () => {
        const club = await this.prisma.sportClub.findUnique({
          where: { sport_slug: { sport, slug } },
        });
        return club?.logoSource?.startsWith(SPORTCORICO_MEDIA)
          ? club.logoSource
          : null;
      },
    );
  }

  /**
   * A crest kept on disk (like an uploaded logo) and refreshed after
   * CREST_REFRESH_MS, so a club's new crest shows up eventually; a stale
   * copy beats no crest while the source misbehaves.
   */
  private async cachedCrest(
    dir: string,
    name: string,
    sourceUrl: () => Promise<string | null>,
  ): Promise<Crest | null> {
    const file = join(dir, name);
    const cached = await fs.readFile(file).catch(() => null);
    const cachedAt = cached
      ? (await fs.stat(file).catch(() => null))?.mtimeMs
      : undefined;
    if (cached && cachedAt && Date.now() - cachedAt < CREST_REFRESH_MS) {
      return withImageType(cached);
    }
    const url = await sourceUrl();
    if (!url) {
      return null;
    }
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'TournArena (https://tournarena.com)' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        return cached ? withImageType(cached) : null;
      }
      const data = Buffer.from(await res.arrayBuffer());
      const crest =
        data.byteLength <= MAX_CREST_BYTES ? withImageType(data) : null;
      if (!crest && cached) {
        return withImageType(cached);
      }
      if (crest) {
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(file, data);
      }
      return crest;
    } catch (error) {
      this.logger.warn(
        `Crest fetch failed for ${name}: ${(error as Error).message}`,
      );
      return cached ? withImageType(cached) : null;
    }
  }

  private uploadsDir(): string {
    return this.configService.get<string>('UPLOADS_DIR', './uploads');
  }

  private async searchFff(q: string): Promise<ClubSuggestion[]> {
    // Every word must appear in the name, short name or city:
    // "consolat septemes" finds "FC Septemes Consolat".
    const clubs = await this.prisma.fffClub.findMany({
      where: {
        dissolvedAt: null,
        AND: q.split(' ').map((word) => ({
          OR: [
            { name: { contains: word, mode: 'insensitive' as const } },
            { shortName: { contains: word, mode: 'insensitive' as const } },
            { city: { contains: word, mode: 'insensitive' as const } },
          ],
        })),
      },
      orderBy: { name: 'asc' },
      take: MAX_RESULTS,
    });
    return clubs.map((club) => ({
      source: 'fff',
      externalId: `fff:${club.code}`,
      name: club.name,
      city: club.city,
      postalCode: club.postalCode,
      department: club.department,
      logoUrl: `${CREST_PATH}${club.code}`,
    }));
  }

  private async searchSportClubs(
    q: string,
    sport: ClubDirectorySport,
  ): Promise<ClubSuggestion[]> {
    const clubs = await this.prisma.sportClub.findMany({
      where: {
        sport,
        dissolvedAt: null,
        AND: q.split(' ').map((word) => ({
          name: { contains: word, mode: 'insensitive' as const },
        })),
      },
      orderBy: { name: 'asc' },
      take: MAX_RESULTS,
    });
    return clubs.map((club) => ({
      source: 'club',
      externalId: `club:${sport}:${club.slug}`,
      name: club.name,
      city: null,
      postalCode: null,
      department: club.department,
      logoUrl: club.logoSource ? `${CREST_PATH}${sport}/${club.slug}` : null,
    }));
  }

  private async searchGouv(
    q: string,
    sport: ClubDirectorySport,
  ): Promise<ClubSuggestion[]> {
    const baseUrl = this.configService.get<string>(
      'RECHERCHE_ENTREPRISES_URL',
      'https://recherche-entreprises.api.gouv.fr',
    );
    let companies: GouvCompany[];
    try {
      const res = await fetch(
        `${baseUrl}/search?q=${encodeURIComponent(q)}&activite_principale=93.12Z&per_page=25`,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'TournArena (https://tournarena.com)',
          },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!res.ok) {
        throw new Error(`recherche-entreprises responded ${res.status}`);
      }
      companies =
        ((await res.json()) as { results?: GouvCompany[] }).results ?? [];
    } catch (error) {
      this.logger.warn(`Club search failed: ${(error as Error).message}`);
      throw new BadGatewayException(
        'Recherche des clubs indisponible pour le moment.',
      );
    }
    return toGouvSuggestions(companies, sport);
  }

  private logoUrlFor(clubNumber: string): string {
    const template = this.configService.get<string>(
      'FFF_CLUB_LOGO_URL_TEMPLATE',
      DEFAULT_LOGO_TEMPLATE,
    );
    return template.replace('{id}', clubNumber);
  }
}

/** The FFF CDN serves PNGs as .jpg: trust the bytes, not the name. */
function withImageType(data: Buffer): Crest | null {
  const contentType = CREST_MIME_TYPES.find((type) =>
    matchesImageMagicBytes(data, type),
  );
  return contentType ? { data, contentType } : null;
}

const SPORT_HINTS: Record<ClubDirectorySport, RegExp> = {
  football: FOOTBALL_HINT,
  basketball: /basket|\bbc\b|\bbb\b/i,
  handball: /hand|\bhb\b|\bhbc\b/i,
  rugby: /rugby|\brc\b|\bxv\b/i,
  volleyball: /volley|\bvb\b|\bvbc\b/i,
  tennis: /tennis|\btc\b/i,
};

/**
 * Company register results -> suggestions. NAF 93.12Z covers every sport,
 * so names that look like a club of the searched sport come first.
 */
export function toGouvSuggestions(
  companies: GouvCompany[],
  sport: ClubDirectorySport = 'football',
): ClubSuggestion[] {
  const hint = SPORT_HINTS[sport];
  const seen = new Set<string>();
  const results: ClubSuggestion[] = [];
  for (const company of companies) {
    const siren = company.siren?.trim();
    const name = company.nom_complet?.trim();
    if (!siren || !/^\d{9}$/.test(siren) || !name || seen.has(siren)) {
      continue;
    }
    seen.add(siren);
    results.push({
      source: 'siren',
      externalId: `siren:${siren}`,
      name: name.slice(0, 200),
      city: company.siege?.libelle_commune?.trim() || null,
      postalCode: company.siege?.code_postal?.trim() || null,
      department: null,
      logoUrl: null,
    });
  }
  return results
    .map((club, index) => ({ club, index, match: hint.test(club.name) }))
    .sort((a, b) => Number(b.match) - Number(a.match) || a.index - b.index)
    .slice(0, MAX_RESULTS)
    .map(({ club }) => club);
}
