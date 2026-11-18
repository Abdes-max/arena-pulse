import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { join } from 'path';
import { matchesImageMagicBytes } from '../common/utils/image-magic-bytes.util';
import { PrismaService } from '../prisma/prisma.service';

/** One club suggestion, ready to display and to create a Team from. */
export interface ClubSuggestion {
  /** "fff": our FffClub directory; "siren": the State's company register. */
  source: 'fff' | 'siren';
  /** Stable link kept on Team.externalClubId, e.g. "fff:553079". */
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

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const MAX_RESULTS = 8;
const FFF_EXTERNAL_ID = /^fff:(\d{1,10})$/;
// Same domain as the FFF's own sites: club crests by affiliation number.
const DEFAULT_LOGO_TEMPLATE =
  'https://cdn-transverse.azureedge.net/phlogos/BC{id}.jpg';
// Our own crest route (ClubDirectoryController.logo): the web CSP only allows
// images from 'self', so the FFF CDN is never hit by the browser directly.
const CREST_PATH = '/api/v1/club-directory/logos/';
const CREST_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_CREST_BYTES = 512 * 1024;
const CREST_REFRESH_MS = 90 * 24 * 60 * 60 * 1000;
const FOOTBALL_HINT = /foot|\bfc\b|\bas\b|\bus\b|\bes\b|olympique|sporting/i;

/**
 * Football club search behind the team form's autocomplete.
 *
 * The FFF publishes no open API, so the reference is our own FffClub table
 * (FFF affiliation number, name, city), loaded from a file by
 * prisma/import-fff-clubs.ts; picking one of those also brings the club's
 * crest. Until that table is filled, it falls back to the State's company
 * register (recherche-entreprises.api.gouv.fr, free, no key), restricted to
 * sports clubs (NAF 93.12Z) -- no FFF number nor crest there, just the name.
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

  async search(query: string): Promise<ClubSuggestion[]> {
    const q = query.trim().replace(/\s+/g, ' ');
    if (q.length < 3) {
      return [];
    }
    const key = q.toLowerCase();
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.results;
    }

    const results =
      (await this.prisma.fffClub.count({ where: { dissolvedAt: null } })) > 0
        ? await this.searchFff(q)
        : await this.searchGouv(q);
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
   * Crest of a team's linked club (Team.externalClubId), for TeamsService
   * to store as the team logo -- same cached, byte-sniffed image as the
   * suggestions show (the FFF CDN labels PNGs "image/jpg"). Only FFF clubs
   * have one; the URL is never taken from the client.
   */
  crestForExternalId(
    externalId: string,
  ): Promise<{ data: Buffer; contentType: string } | null> {
    const match = FFF_EXTERNAL_ID.exec(externalId);
    return match ? this.crest(match[1]) : Promise.resolve(null);
  }

  /**
   * A directory club's crest, fetched from the FFF CDN then kept under
   * UPLOADS_DIR/fff-logos (like an uploaded logo) and refreshed after
   * CREST_REFRESH_MS, so a club's new crest shows up eventually. Only for clubs we know --
   * the route is public (an <img> sends no token), so it must not become an
   * open proxy. Null when the club or its crest doesn't exist.
   */
  async crest(
    code: string,
  ): Promise<{ data: Buffer; contentType: string } | null> {
    if (!/^\d{1,10}$/.test(code)) {
      return null;
    }
    const file = join(this.uploadsDir(), 'fff-logos', code);
    const cached = await fs.readFile(file).catch(() => null);
    const cachedAt = cached
      ? (await fs.stat(file).catch(() => null))?.mtimeMs
      : undefined;
    if (cached && cachedAt && Date.now() - cachedAt < CREST_REFRESH_MS) {
      return withImageType(cached);
    }
    if (!(await this.prisma.fffClub.findUnique({ where: { code } }))) {
      return null;
    }
    try {
      const res = await fetch(this.logoUrlFor(code), {
        headers: { 'User-Agent': 'TournArena (https://tournarena.com)' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        // A stale copy beats no crest while the CDN misbehaves.
        return cached ? withImageType(cached) : null;
      }
      const data = Buffer.from(await res.arrayBuffer());
      const crest =
        data.byteLength <= MAX_CREST_BYTES ? withImageType(data) : null;
      if (!crest && cached) {
        return withImageType(cached);
      }
      if (crest) {
        await fs.mkdir(join(this.uploadsDir(), 'fff-logos'), {
          recursive: true,
        });
        await fs.writeFile(file, data);
      }
      return crest;
    } catch (error) {
      this.logger.warn(
        `Crest fetch failed for ${code}: ${(error as Error).message}`,
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

  private async searchGouv(q: string): Promise<ClubSuggestion[]> {
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
    return toGouvSuggestions(companies);
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
function withImageType(
  data: Buffer,
): { data: Buffer; contentType: string } | null {
  const contentType = CREST_MIME_TYPES.find((type) =>
    matchesImageMagicBytes(data, type),
  );
  return contentType ? { data, contentType } : null;
}

/**
 * Company register results -> suggestions. NAF 93.12Z covers every sport,
 * so names that look like a football club come first.
 */
export function toGouvSuggestions(companies: GouvCompany[]): ClubSuggestion[] {
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
    .map((club, index) => ({
      club,
      index,
      football: FOOTBALL_HINT.test(club.name),
    }))
    .sort(
      (a, b) => Number(b.football) - Number(a.football) || a.index - b.index,
    )
    .slice(0, MAX_RESULTS)
    .map(({ club }) => club);
}
