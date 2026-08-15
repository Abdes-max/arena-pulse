import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Shared write path for SuperAdminAuditLog -- every mutating action in the
 * super-admin surface (suspend/reactivate an organization, verify a user's
 * email, annotate a stuck payment) goes through this single method so the
 * "who/what/when/note" shape stays consistent and nothing forgets to log.
 */
@Injectable()
export class SuperAdminAuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  record(params: {
    superAdminId: string;
    action: string;
    targetType: string;
    targetId: string;
    note?: string;
  }): Promise<void> {
    return this.prisma.superAdminAuditLog
      .create({
        data: {
          superAdminId: params.superAdminId,
          action: params.action,
          targetType: params.targetType,
          targetId: params.targetId,
          note: params.note,
        },
      })
      .then(() => undefined);
  }

  /** Latest note per (targetType, targetId), for surfacing an annotation inline on a list row. */
  async latestNotesByTarget(
    targetType: string,
    targetIds: string[],
  ): Promise<Map<string, string>> {
    if (targetIds.length === 0) {
      return new Map();
    }
    const entries = await this.prisma.superAdminAuditLog.findMany({
      where: { targetType, targetId: { in: targetIds }, note: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    const notes = new Map<string, string>();
    for (const entry of entries) {
      if (!notes.has(entry.targetId) && entry.note) {
        notes.set(entry.targetId, entry.note);
      }
    }
    return notes;
  }
}
