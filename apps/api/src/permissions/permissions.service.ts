import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const permissions = await this.prisma.permission.findMany({
      orderBy: { position: 'asc' },
    });
    return permissions.map((permission) => ({
      id: permission.id,
      key: permission.key,
      label: permission.label,
    }));
  }

  /** Resolves permission keys (e.g. "MANAGE_SCORES") to their row ids, rejecting unknown keys. */
  async resolveKeysToIds(keys: string[]): Promise<string[]> {
    if (keys.length === 0) {
      return [];
    }
    const permissions = await this.prisma.permission.findMany({
      where: { key: { in: keys } },
    });
    const foundKeys = new Set(permissions.map((permission) => permission.key));
    const unknownKeys = keys.filter((key) => !foundKeys.has(key));
    if (unknownKeys.length > 0) {
      throw new BadRequestException(
        `Clés de permission inconnues : ${unknownKeys.join(', ')}`,
      );
    }
    return permissions.map((permission) => permission.id);
  }
}
