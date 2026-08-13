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
    const team = await this.getOrThrow(tournamentId, teamId);

    const extension = TEAM_LOGO_ALLOWED_MIME_TYPES[file.mimetype];
    if (!extension) {
      throw new BadRequestException(
        "Format d'image non supporté (PNG, JPEG ou WebP uniquement).",
      );
    }
    if (file.size > TEAM_LOGO_MAX_SIZE_BYTES) {
      throw new BadRequestException('Le logo ne doit pas dépasser 2 Mo.');
    }

    const logosDir = join(this.uploadsDir(), 'team-logos');
    await fs.mkdir(logosDir, { recursive: true });
    const filename = `${teamId}-${randomUUID()}.${extension}`;
    await fs.writeFile(join(logosDir, filename), file.buffer);
    await this.deleteLogoFile(team.logoUrl);

    const updated = await this.prisma.team.update({
      where: { id: teamId },
      data: { logoUrl: `/uploads/team-logos/${filename}` },
    });
    return this.toSummary({
      ...updated,
      category: team.category,
      division: team.division,
      group: team.group,
    });
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
    const { rows, errors } = parseTeamsCsv(csv);
    const created: ReturnType<TeamsService['toSummary']>[] = [];

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

      const team = await this.prisma.team.create({
        data: {
          tournamentId,
          categoryId: category.id,
          divisionId: division?.id,
          name: row.name,
        },
      });
      created.push(
        this.toSummary({ ...team, category, division, group: null }),
      );
    }

    return { created, errors };
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
