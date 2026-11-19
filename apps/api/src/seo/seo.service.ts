import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TournamentStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Public pages worth indexing besides each tournament's own site. */
const STATIC_PATHS = ['/', '/discover', '/contact', '/terms', '/privacy'];

// Google ignores anything past 50 000 URLs per sitemap file.
const MAX_TOURNAMENTS = 49_000;

@Injectable()
export class SeoService {
  private readonly webUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    // Same ADMIN_WEB_URL every other absolute web link is built on
    // (mail.service.ts, auth.service.ts) -- the public site is that origin.
    this.webUrl = configService
      .get<string>('ADMIN_WEB_URL', 'http://localhost:4300')
      .replace(/\/+$/, '');
  }

  /**
   * sitemap.xml (proxied by nginx from /sitemap.xml): the marketing pages
   * plus every PUBLISHED *and* isListed tournament -- the same gate as the
   * public directory, so a private tournament never ends up on Google.
   */
  async sitemap(): Promise<string> {
    const tournaments = await this.prisma.tournament.findMany({
      where: { status: TournamentStatus.PUBLISHED, isListed: true },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: MAX_TOURNAMENTS,
    });
    const urls = [
      ...STATIC_PATHS.map((path) => this.url(path)),
      ...tournaments.map((t) =>
        this.url(`/${encodeURIComponent(t.slug)}`, t.updatedAt),
      ),
    ];
    return [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      ...urls,
      '</urlset>',
      '',
    ].join('\n');
  }

  private url(path: string, lastModified?: Date): string {
    const lastmod = lastModified
      ? `<lastmod>${lastModified.toISOString().slice(0, 10)}</lastmod>`
      : '';
    return `  <url><loc>${escapeXml(this.webUrl + path)}</loc>${lastmod}</url>`;
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
