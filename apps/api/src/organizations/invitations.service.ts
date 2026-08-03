import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvitationStatus } from '../../generated/prisma/client';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { InviteMemberDto } from './dto/invite-member.dto';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
  ) {}

  async invite(
    organizationId: string,
    invitedByUserId: string,
    dto: InviteMemberDto,
  ) {
    const existingMember = await this.prisma.organizationMember.findFirst({
      where: { organizationId, user: { email: dto.email } },
    });
    if (existingMember) {
      throw new ConflictException(
        'Cette personne est déjà membre de cette organisation.',
      );
    }
    const existingPending = await this.prisma.invitation.findFirst({
      where: {
        organizationId,
        email: dto.email,
        status: InvitationStatus.PENDING,
      },
    });
    if (existingPending) {
      throw new ConflictException(
        'Une invitation est déjà en attente pour cet email.',
      );
    }

    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
    });

    const token = randomBytes(32).toString('base64url');
    const invitation = await this.prisma.invitation.create({
      data: {
        organizationId,
        email: dto.email,
        role: dto.role,
        tokenHash: this.hashToken(token),
        invitedById: invitedByUserId,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      },
    });

    try {
      await this.mailService.sendInvitationEmail(
        dto.email,
        organization.name,
        this.buildInviteUrl(token),
      );
    } catch (error) {
      // The invitation itself is valid regardless of whether the email made
      // it out — failing the whole request here would leave a PENDING
      // invitation the admin can't see or retry (it already exists, so a
      // second attempt would just hit the duplicate-pending-invite check).
      this.logger.warn(
        `Failed to send invitation email to ${dto.email}: ${(error as Error).message}`,
      );
    }

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
    };
  }

  async listPending(organizationId: string) {
    const invitations = await this.prisma.invitation.findMany({
      where: { organizationId, status: InvitationStatus.PENDING },
      orderBy: { createdAt: 'desc' },
    });
    return invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
    }));
  }

  async revoke(organizationId: string, invitationId: string): Promise<void> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
    });
    if (!invitation || invitation.organizationId !== organizationId) {
      throw new NotFoundException('Invitation introuvable.');
    }
    await this.prisma.invitation.update({
      where: { id: invitationId },
      data: { status: InvitationStatus.REVOKED },
    });
  }

  async lookup(token: string) {
    const invitation = await this.findValidPendingByToken(token);
    const existingUser = await this.prisma.user.findUnique({
      where: { email: invitation.email },
    });
    return {
      organizationName: invitation.organization.name,
      email: invitation.email,
      role: invitation.role,
      requiresNewAccount: !existingUser,
    };
  }

  async accept(
    token: string,
    currentUser: AuthenticatedUser | null,
    dto: AcceptInvitationDto,
  ) {
    const invitation = await this.findValidPendingByToken(token);
    const existingUser = await this.prisma.user.findUnique({
      where: { email: invitation.email },
    });

    if (existingUser) {
      if (!currentUser || currentUser.email !== invitation.email) {
        throw new ForbiddenException(
          'Connectez-vous avec le compte invité pour accepter cette invitation.',
        );
      }
      await this.prisma.$transaction([
        this.prisma.organizationMember.create({
          data: {
            organizationId: invitation.organizationId,
            userId: existingUser.id,
            role: invitation.role,
          },
        }),
        this.prisma.invitation.update({
          where: { id: invitation.id },
          data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() },
        }),
      ]);
      return {
        organization: {
          id: invitation.organizationId,
          name: invitation.organization.name,
          role: invitation.role,
        },
      };
    }

    if (!dto.password || !dto.firstName || !dto.lastName) {
      throw new BadRequestException(
        'Mot de passe, prénom et nom requis pour créer un compte.',
      );
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    const { user } = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: invitation.email,
          passwordHash,
          firstName: dto.firstName!,
          lastName: dto.lastName!,
        },
      });
      await tx.organizationMember.create({
        data: {
          organizationId: invitation.organizationId,
          userId: createdUser.id,
          role: invitation.role,
        },
      });
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.ACCEPTED, acceptedAt: new Date() },
      });
      return { user: createdUser };
    });

    const issued = this.tokenService.issueRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: issued.tokenHash,
        familyId: user.id,
        expiresAt: issued.expiresAt,
      },
    });

    return {
      organization: {
        id: invitation.organizationId,
        name: invitation.organization.name,
        role: invitation.role,
      },
      accessToken: this.tokenService.signAccessToken({
        sub: user.id,
        email: user.email,
        type: 'organizer',
      }),
      expiresIn: this.tokenService.accessTokenExpiresInSeconds,
      refreshToken: issued.token,
      refreshTokenExpiresAt: issued.expiresAt,
    };
  }

  private async findValidPendingByToken(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: { organization: true },
    });
    if (!invitation || invitation.status !== InvitationStatus.PENDING) {
      throw new NotFoundException('Invitation introuvable ou déjà utilisée.');
    }
    if (invitation.expiresAt < new Date()) {
      throw new NotFoundException('Invitation expirée.');
    }
    return invitation;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildInviteUrl(token: string): string {
    const adminWebUrl = this.configService.get<string>(
      'ADMIN_WEB_URL',
      'http://localhost:4300',
    );
    return `${adminWebUrl}/accept-invitation/${token}`;
  }
}
