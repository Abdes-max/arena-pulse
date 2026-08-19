import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { Category, Division, Group, Team } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';
import { DivisionsService } from './divisions.service';
import { AssignTeamGroupDto } from './dto/assign-team-group.dto';
import { BulkDeleteTeamsDto } from './dto/bulk-delete-teams.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { GroupsService } from './groups.service';
import { parseTeamsCsv, serializeTeamsCsv } from './teams-csv.util';
import { TournamentsService } from './tournaments.service';

type TeamWithRelations = Team & {
  category: Category;
  division: Division | null;
  group: Group | null;
};

// Extension derived from the validated mimetype, never from the client's
// original filename -- avoids trusting user input for something that ends
// up in a filesystem path.
const TEAM_LOGO_ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const TEAM_LOGO_MAX_SIZE_BYTES = 2 * 1024 * 1024;

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly categoriesService: CategoriesService,
    private readonly divisionsService: DivisionsService,
    private readonly groupsService: GroupsService,
    private readonly configService: ConfigService,
  ) {}

  async create(
    organizationId: string,
    tournamentId: string,
    dto: CreateTeamDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const category = await this.categoriesService.assertCategoryExists(
      tournamentId,
      dto.categoryId,
    );
    const division = dto.divisionId
      ? await this.divisionsService.assertDivisionExists(
          category.id,
          dto.divisionId,
        )
      : null;
    await this.assertNameAvailable(tournamentId, dto.name);

    const team = await this.prisma.team.create({
      data: {
        tournamentId,
        categoryId: category.id,
        divisionId: division?.id,
        name: dto.name,
        managerName: dto.managerName,
        managerEmail: dto.managerEmail,
        managerPhone: dto.managerPhone,
      },
    });
    return this.toSummary({ ...team, category, division, group: null });
  }

  async list(
    organizationId: string,
    tournamentId: string,
    filters: { categoryId?: string; divisionId?: string },
  ) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    const teams = await this.prisma.team.findMany({
      where: {
        tournamentId,
        categoryId: filters.categoryId,
        divisionId: filters.divisionId,
      },
      include: { category: true, division: true, group: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    return teams.map((team) => this.toSummary(team));
  }

  async getOne(organizationId: string, tournamentId: string, teamId: string) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    const team = await this.getOrThrow(tournamentId, teamId);
    return this.toSummary(team);
  }

  async update(
    organizationId: string,
    tournamentId: string,
    teamId: string,
    dto: UpdateTeamDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const team = await this.getOrThrow(tournamentId, teamId);
    if (dto.name && dto.name !== team.name) {
      await this.assertNameAvailable(tournamentId, dto.name, teamId);
    }

    const categoryId = dto.categoryId ?? team.categoryId;
    const category =
      dto.categoryId && dto.categoryId !== team.categoryId
        ? await this.categoriesService.assertCategoryExists(
            tournamentId,
            categoryId,
          )
        : team.category;

    let divisionId: string | null | undefined = undefined;
    let division: Division | null | undefined = undefined;
    if (dto.divisionId !== undefined) {
      if (dto.divisionId === '') {
        divisionId = null;
        division = null;
      } else {
        division = await this.divisionsService.assertDivisionExists(
          categoryId,
          dto.divisionId,
        );
        divisionId = division.id;
      }
    }

    const updated = await this.prisma.team.update({
      where: { id: teamId },
      data: {
        name: dto.name,
        categoryId: dto.categoryId ? categoryId : undefined,
        divisionId,
        managerName: dto.managerName,
        managerEmail: dto.managerEmail,
        managerPhone: dto.managerPhone,
      },
    });
    return this.toSummary({
      ...updated,
      category,
      division: division !== undefined ? division : team.division,
      group: team.group,
    });
  }

  async remove(
    organizationId: string,
    tournamentId: string,
    teamId: string,
  ): Promise<void> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const team = await this.getOrThrow(tournamentId, teamId);
    await this.prisma.team.delete({ where: { id: teamId } });
    await this.deleteLogoFile(team.logoUrl);
  }

  async bulkRemove(
    organizationId: string,
    tournamentId: string,
    dto: BulkDeleteTeamsDto,
  ): Promise<void> {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const teams = await this.prisma.team.findMany({
      where: { tournamentId, id: { in: dto.teamIds } },
      select: { logoUrl: true },
    });
    await this.prisma.team.deleteMany({
      where: { tournamentId, id: { in: dto.teamIds } },
    });
    await Promise.all(teams.map((team) => this.deleteLogoFile(team.logoUrl)));
  }

  /**
   * Stored on local disk under UPLOADS_DIR (default ./uploads), served
   * statically by the API itself at /uploads (see main.ts) -- see the
   * "upload de fichier, stocké sur le serveur" decision for feat/045. A
   * named Docker volume keeps this directory across container recreation
   * in production (infra/deployment/docker-compose.prod.yml).
   */
  async uploadLogo(
    organizationId: string,
    tournamentId: string,
    teamId: string,
    file: Express.Multer.File,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.tournamentsService.assertPremiumFeaturesUnlocked(
      organizationId,
      tournamentId,
    );
    const team = await this.getOrThrow(tournamentId, teamId);

    const logoUrl = await this.saveLogoBuffer(
      teamId,
      file.buffer,
      file.mimetype,
      file.size,
    );
    await this.deleteLogoFile(team.logoUrl);

    const updated = await this.prisma.team.update({
      where: { id: teamId },
      data: { logoUrl },
    });
    return this.toSummary({
      ...updated,
      category: team.category,
      division: team.division,
      group: team.group,
    });
  }

  /**
   * Shared by uploadLogo (multipart) and the CSV import's logoUrl column
   * (fetched from an http(s) URL, see resolveImportLogoUrl) -- same
   * validation and on-disk layout either way, only where the bytes come
   * from differs.
   */
  private async saveLogoBuffer(
    teamId: string,
    buffer: Buffer,
    mimetype: string,
    sizeBytes: number,
  ): Promise<string> {
    const extension = TEAM_LOGO_ALLOWED_MIME_TYPES[mimetype];
    if (!extension) {
      throw new BadRequestException(
        "Format d'image non supporté (PNG, JPEG ou WebP uniquement).",
      );
    }
    if (sizeBytes > TEAM_LOGO_MAX_SIZE_BYTES) {
      throw new BadRequestException('Le logo ne doit pas dépasser 2 Mo.');
    }

    const logosDir = join(this.uploadsDir(), 'team-logos');
    await fs.mkdir(logosDir, { recursive: true });
    const filename = `${teamId}-${randomUUID()}.${extension}`;
    await fs.writeFile(join(logosDir, filename), buffer);
    return `/uploads/team-logos/${filename}`;
  }

  /**
   * Resolves a CSV row's `logo` column: either an existing
   * /uploads/team-logos/... path (round-tripped from a previous export --
   * trusted as-is, no fetch needed) or an absolute http(s) URL to download
   * and store as a fresh logo. Never throws -- a bad/unreachable URL just
   * means the team is created without a logo, with a warning surfaced back
   * to the organizer, rather than failing the whole row (same "best effort,
   * non-fatal" posture as infra/scripts' World Cup seed logo upload).
   */
  private async resolveImportLogoUrl(
    teamId: string,
    rawLogoUrl: string | undefined,
  ): Promise<{ logoUrl: string | null; warning?: string }> {
    if (!rawLogoUrl) {
      return { logoUrl: null };
    }
    if (rawLogoUrl.startsWith('/uploads/team-logos/')) {
      return { logoUrl: rawLogoUrl };
    }
    if (!/^https?:\/\//i.test(rawLogoUrl)) {
      return {
        logoUrl: null,
        warning: `Logo ignoré (${rawLogoUrl}) : URL non reconnue (attendu http(s):// ou un chemin /uploads/team-logos/ existant).`,
      };
    }
    try {
      const response = await fetch(rawLogoUrl, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const contentType =
        response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
      const buffer = Buffer.from(await response.arrayBuffer());
      const logoUrl = await this.saveLogoBuffer(
        teamId,
        buffer,
        contentType,
        buffer.byteLength,
      );
      return { logoUrl };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        logoUrl: null,
        warning: `Logo non récupéré (${rawLogoUrl}) : ${message}.`,
      };
    }
  }

  async removeLogo(
    organizationId: string,
    tournamentId: string,
    teamId: string,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const team = await this.getOrThrow(tournamentId, teamId);
    await this.deleteLogoFile(team.logoUrl);

    const updated = await this.prisma.team.update({
      where: { id: teamId },
      data: { logoUrl: null },
    });
    return this.toSummary({
      ...updated,
      category: team.category,
      division: team.division,
      group: team.group,
    });
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
      await fs.unlink(join(this.uploadsDir(), 'team-logos', filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Not wrapped in a transaction on purpose: valid rows must be created even
   * when other rows in the same file are invalid (partial-success import).
   */
  async importFromCsv(
    organizationId: string,
    tournamentId: string,
    csv: string,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    // Checked once up front (not per-row via assertPremiumFeaturesUnlocked,
    // which would throw and abort the whole import on the first logo
    // column) -- a locked tournament still imports every team, it just
    // skips each row's logo with a warning, same non-fatal posture as an
    // unreachable logo URL (resolveImportLogoUrl).
    const premiumUnlocked = await this.tournamentsService.hasPremiumFeatures(
      organizationId,
      tournamentId,
    );
    const { rows, errors } = parseTeamsCsv(csv);
    const created: ReturnType<TeamsService['toSummary']>[] = [];
    const warnings: { line: number; message: string }[] = [];

    for (const row of rows) {
      const category = await this.prisma.category.findFirst({
        where: { tournamentId, name: row.categoryName },
      });
      if (!category) {
        errors.push({
          line: row.line,
          message: `Catégorie "${row.categoryName}" introuvable.`,
        });
        continue;
      }

      let division: Division | null = null;
      if (row.divisionName) {
        division = await this.prisma.division.findFirst({
          where: { categoryId: category.id, name: row.divisionName },
        });
        if (!division) {
          errors.push({
            line: row.line,
            message: `Division "${row.divisionName}" introuvable dans la catégorie "${row.categoryName}".`,
          });
          continue;
        }
      }

      const existing = await this.prisma.team.findFirst({
        where: { tournamentId, name: row.name },
      });
      if (existing) {
        errors.push({
          line: row.line,
          message: `Une équipe nommée "${row.name}" existe déjà.`,
        });
        continue;
      }

      let team = await this.prisma.team.create({
        data: {
          tournamentId,
          categoryId: category.id,
          divisionId: division?.id,
          name: row.name,
          managerName: row.managerName,
          managerEmail: row.managerEmail,
          managerPhone: row.managerPhone,
        },
      });

      // Only attempted once the team (and its id, needed for the stored
      // filename) exists -- a failed fetch just leaves logoUrl null and
      // surfaces a warning, it never undoes the team creation above.
      if (row.logoUrl && !premiumUnlocked) {
        warnings.push({
          line: row.line,
          message: `Logo ignoré (${row.logoUrl}) : réservé aux tournois de plus de ${this.tournamentsService.freeMaxTeams()} équipes ou à un abonnement annuel actif.`,
        });
      } else if (row.logoUrl) {
        const { logoUrl, warning } = await this.resolveImportLogoUrl(
          team.id,
          row.logoUrl,
        );
        if (warning) {
          warnings.push({ line: row.line, message: warning });
        }
        if (logoUrl) {
          team = await this.prisma.team.update({
            where: { id: team.id },
            data: { logoUrl },
          });
        }
      }

      created.push(
        this.toSummary({ ...team, category, division, group: null }),
      );
    }

    return { created, errors, warnings };
  }

  async exportToCsv(
    organizationId: string,
    tournamentId: string,
  ): Promise<string> {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    const teams = await this.prisma.team.findMany({
      where: { tournamentId },
      include: { category: true, division: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    return serializeTeamsCsv(
      teams.map((team) => ({
        name: team.name,
        categoryName: team.category.name,
        divisionName: team.division?.name ?? null,
        managerName: team.managerName,
        managerEmail: team.managerEmail,
        managerPhone: team.managerPhone,
        logoUrl: team.logoUrl,
      })),
    );
  }

  /** Used by PlayersService to validate a teamId belongs to the tournament in the URL. */
  async assertTeamExists(tournamentId: string, teamId: string): Promise<Team> {
    return this.getOrThrow(tournamentId, teamId);
  }

  async assignGroup(
    organizationId: string,
    tournamentId: string,
    teamId: string,
    dto: AssignTeamGroupDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const team = await this.getOrThrow(tournamentId, teamId);

    let group: Group | null = null;
    if (dto.groupId !== null) {
      const candidate = await this.groupsService.assertGroupExists(
        tournamentId,
        dto.groupId,
      );
      if (candidate.phase.categoryId !== team.categoryId) {
        throw new BadRequestException(
          "Cette poule n'appartient pas à la catégorie de l'équipe.",
        );
      }
      group = candidate;
    }

    const updated = await this.prisma.team.update({
      where: { id: teamId },
      data: { groupId: group?.id ?? null },
    });
    return this.toSummary({
      ...updated,
      category: team.category,
      division: team.division,
      group,
    });
  }

  private async getOrThrow(
    tournamentId: string,
    teamId: string,
  ): Promise<TeamWithRelations> {
    const team = await this.prisma.team.findUnique({
      where: { id: teamId },
      include: { category: true, division: true, group: true },
    });
    if (!team || team.tournamentId !== tournamentId) {
      throw new NotFoundException('Équipe introuvable.');
    }
    return team;
  }

  private async assertNameAvailable(
    tournamentId: string,
    name: string,
    excludingTeamId?: string,
  ): Promise<void> {
    const existing = await this.prisma.team.findFirst({
      where: {
        tournamentId,
        name,
        ...(excludingTeamId ? { id: { not: excludingTeamId } } : {}),
      },
    });
    if (existing) {
      throw new ConflictException(
        'Une équipe porte déjà ce nom pour ce tournoi.',
      );
    }
  }

  private toSummary(team: TeamWithRelations) {
    return {
      id: team.id,
      name: team.name,
      categoryId: team.categoryId,
      categoryName: team.category.name,
      divisionId: team.divisionId,
      divisionName: team.division?.name ?? null,
      groupId: team.groupId,
      groupName: team.group?.name ?? null,
      managerName: team.managerName,
      managerEmail: team.managerEmail,
      managerPhone: team.managerPhone,
      logoUrl: team.logoUrl,
      position: team.position,
    };
  }
}
