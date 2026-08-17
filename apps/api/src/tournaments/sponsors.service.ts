import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { TournamentSponsor } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSponsorDto } from './dto/create-sponsor.dto';
import { UpdateSponsorDto } from './dto/update-sponsor.dto';
import { TournamentsService } from './tournaments.service';

// Same rationale as TeamsService/TournamentsService's own logo upload consts.
const SPONSOR_LOGO_ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const SPONSOR_LOGO_MAX_SIZE_BYTES = 2 * 1024 * 1024;

@Injectable()
export class SponsorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Appended at the end (max existing position + 1) -- no reordering UI in
   * v1, sponsors just show in the order they were added.
   */
  async create(
    organizationId: string,
    tournamentId: string,
    dto: CreateSponsorDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );

    const last = await this.prisma.tournamentSponsor.findFirst({
      where: { tournamentId },
      orderBy: { position: 'desc' },
    });
    const sponsor = await this.prisma.tournamentSponsor.create({
      data: {
        tournamentId,
        name: dto.name,
        linkUrl: dto.linkUrl,
        position: last ? last.position + 1 : 0,
      },
    });
    return this.toSummary(sponsor);
  }

  async list(organizationId: string, tournamentId: string) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    const sponsors = await this.prisma.tournamentSponsor.findMany({
      where: { tournamentId },
      orderBy: { position: 'asc' },
    });
    return sponsors.map((sponsor) => this.toSummary(sponsor));
  }

  async update(
    organizationId: string,
    tournamentId: string,
    sponsorId: string,
    dto: UpdateSponsorDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.getOrThrow(tournamentId, sponsorId);

    const updated = await this.prisma.tournamentSponsor.update({
      where: { id: sponsorId },
      data: { name: dto.name, linkUrl: dto.linkUrl },
    });
    return this.toSummary(updated);
  }

  async remove(
    organizationId: string,
    tournamentId: string,
    sponsorId: string,
  ): Promise<void> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const sponsor = await this.getOrThrow(tournamentId, sponsorId);
    await this.deleteLogoFile(sponsor.logoUrl);
    await this.prisma.tournamentSponsor.delete({ where: { id: sponsorId } });
  }

  /**
   * Same on-disk layout as TeamsService/TournamentsService's own logo
   * upload, just its own sponsor-logos subfolder. A sponsor is created
   * name-only first (see create() above), then its logo uploaded here in a
   * second step -- same two-step flow as a tournament/team logo.
   */
  async uploadLogo(
    organizationId: string,
    tournamentId: string,
    sponsorId: string,
    file: Express.Multer.File,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const sponsor = await this.getOrThrow(tournamentId, sponsorId);

    const logoUrl = await this.saveLogoBuffer(
      sponsorId,
      file.buffer,
      file.mimetype,
      file.size,
    );
    await this.deleteLogoFile(sponsor.logoUrl);

    const updated = await this.prisma.tournamentSponsor.update({
      where: { id: sponsorId },
      data: { logoUrl },
    });
    return this.toSummary(updated);
  }

  async removeLogo(
    organizationId: string,
    tournamentId: string,
    sponsorId: string,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const sponsor = await this.getOrThrow(tournamentId, sponsorId);
    await this.deleteLogoFile(sponsor.logoUrl);

    const updated = await this.prisma.tournamentSponsor.update({
      where: { id: sponsorId },
      data: { logoUrl: null },
    });
    return this.toSummary(updated);
  }

  private async saveLogoBuffer(
    sponsorId: string,
    buffer: Buffer,
    mimetype: string,
    sizeBytes: number,
  ): Promise<string> {
    const extension = SPONSOR_LOGO_ALLOWED_MIME_TYPES[mimetype];
    if (!extension) {
      throw new BadRequestException(
        "Format d'image non supporté (PNG, JPEG ou WebP uniquement).",
      );
    }
    if (sizeBytes > SPONSOR_LOGO_MAX_SIZE_BYTES) {
      throw new BadRequestException('Le logo ne doit pas dépasser 2 Mo.');
    }

    const logosDir = join(this.uploadsDir(), 'sponsor-logos');
    await fs.mkdir(logosDir, { recursive: true });
    const filename = `${sponsorId}-${randomUUID()}.${extension}`;
    await fs.writeFile(join(logosDir, filename), buffer);
    return `/uploads/sponsor-logos/${filename}`;
  }

  private uploadsDir(): string {
    return this.configService.get<string>('UPLOADS_DIR', './uploads');
  }

  /** Best-effort: a file already gone (or never existing) is not an error. */
  private async deleteLogoFile(logoUrl: string | null): Promise<void> {
    if (!logoUrl) {
      return;
    }
    const filename = logoUrl.split('/').pop();
    if (!filename) {
      return;
    }
    try {
      await fs.unlink(join(this.uploadsDir(), 'sponsor-logos', filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private async getOrThrow(
    tournamentId: string,
    sponsorId: string,
  ): Promise<TournamentSponsor> {
    const sponsor = await this.prisma.tournamentSponsor.findUnique({
      where: { id: sponsorId },
    });
    if (!sponsor || sponsor.tournamentId !== tournamentId) {
      throw new NotFoundException('Sponsor introuvable.');
    }
    return sponsor;
  }

  private toSummary(sponsor: TournamentSponsor) {
    return {
      id: sponsor.id,
      name: sponsor.name,
      logoUrl: sponsor.logoUrl,
      linkUrl: sponsor.linkUrl,
      position: sponsor.position,
    };
  }
}
