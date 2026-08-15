import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrganizationRole } from '../../generated/prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface TokenPair {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<{
    status: 'PENDING_EMAIL_VERIFICATION';
    email: string;
  }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Un compte existe déjà avec cet email.');
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    const verificationToken = randomBytes(32).toString('base64url');

    const { user, organization } = await this.prisma.$transaction(
      async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            email: dto.email,
            passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
            emailVerificationTokenHash: this.hashToken(verificationToken),
            emailVerificationExpiresAt: new Date(
              Date.now() + EMAIL_VERIFICATION_TTL_MS,
            ),
          },
        });
        const createdOrganization = await tx.organization.create({
          data: { name: dto.organizationName },
        });
        await tx.organizationMember.create({
          data: {
            organizationId: createdOrganization.id,
            userId: createdUser.id,
            role: OrganizationRole.ORG_ADMIN,
          },
        });
        return { user: createdUser, organization: createdOrganization };
      },
    );

    // Best-effort, non-blocking (same rationale as InvitationsService.
    // invite's mail try/catch): the account is already created regardless
    // of whether the email makes it out -- resendVerificationEmail() covers
    // the case where it doesn't.
    try {
      await this.mailService.sendEmailVerificationEmail(
        user.email,
        user.firstName,
        this.buildVerifyEmailUrl(verificationToken),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to send verification email to ${user.email}: ${(error as Error).message}`,
      );
    }
    try {
      await this.mailService.sendAccountCreatedEmail(
        user.email,
        user.firstName,
        organization.name,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to send account confirmation email to ${user.email}: ${(error as Error).message}`,
      );
    }

    // No session issued here -- register() no longer logs the account in.
    // The account only becomes usable once verifyEmail() confirms the
    // address, which is where issueTokenPair() actually happens.
    return { status: 'PENDING_EMAIL_VERIFICATION', email: user.email };
  }

  async login(dto: LoginDto): Promise<TokenPair & { user: UserSummary }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (
      !user ||
      !(await this.passwordService.verify(user.passwordHash, dto.password))
    ) {
      throw new UnauthorizedException('Identifiants invalides.');
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException(
        'Vérifiez votre email avant de vous connecter.',
      );
    }

    const tokens = await this.issueTokenPair(user.id, user.email, randomUUID());
    return { ...tokens, user: this.toUserSummary(user) };
  }

  /** Consumes a verification token (single use, same pattern as InvitationsService's tokenHash) and logs the now-verified account in directly -- avoids an extra login round-trip right after confirming. */
  async verifyEmail(token: string): Promise<TokenPair & { user: UserSummary }> {
    const user = await this.prisma.user.findUnique({
      where: { emailVerificationTokenHash: this.hashToken(token) },
    });
    if (!user) {
      throw new NotFoundException(
        'Lien de vérification invalide ou déjà utilisé.',
      );
    }
    if (
      !user.emailVerificationExpiresAt ||
      user.emailVerificationExpiresAt < new Date()
    ) {
      throw new NotFoundException('Lien de vérification expiré.');
    }

    const verifiedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        emailVerificationTokenHash: null,
        emailVerificationExpiresAt: null,
      },
    });

    const tokens = await this.issueTokenPair(
      verifiedUser.id,
      verifiedUser.email,
      randomUUID(),
    );
    return { ...tokens, user: this.toUserSummary(verifiedUser) };
  }

  /**
   * Always responds the same way whether or not the account exists (avoids
   * leaking which emails are registered) -- same posture as most "forgot
   * password"-style endpoints. Silently no-ops for an already-verified
   * account instead of erroring, since re-requesting a link for a verified
   * account isn't a meaningful error state for the caller.
   */
  async resendVerificationEmail(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt) {
      return;
    }

    const verificationToken = randomBytes(32).toString('base64url');
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationTokenHash: this.hashToken(verificationToken),
        emailVerificationExpiresAt: new Date(
          Date.now() + EMAIL_VERIFICATION_TTL_MS,
        ),
      },
    });

    try {
      await this.mailService.sendEmailVerificationEmail(
        user.email,
        user.firstName,
        this.buildVerifyEmailUrl(verificationToken),
      );
    } catch (error) {
      this.logger.warn(
        `Failed to send verification email to ${user.email}: ${(error as Error).message}`,
      );
    }
  }

  async refresh(presentedToken: string): Promise<TokenPair> {
    const tokenHash = this.tokenService.hashRefreshToken(presentedToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!existing) {
      throw new UnauthorizedException('Session invalide.');
    }

    if (existing.revokedAt) {
      // A previously-rotated-out token is being replayed: treat as a theft
      // signal and revoke the whole rotation chain, forcing a fresh login.
      await this.prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Session invalide.');
    }

    if (existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expirée.');
    }

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: existing.userId },
    });
    const issued = this.tokenService.issueRefreshToken();

    await this.prisma.$transaction(async (tx) => {
      const newToken = await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: issued.tokenHash,
          familyId: existing.familyId,
          expiresAt: issued.expiresAt,
        },
      });
      await tx.refreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), replacedByTokenId: newToken.id },
      });
    });

    return {
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

  async logout(presentedToken: string): Promise<void> {
    const tokenHash = this.tokenService.hashRefreshToken(presentedToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { memberships: { include: { organization: true } } },
    });
    return {
      ...this.toUserSummary(user),
      organizations: user.memberships.map((membership) => ({
        id: membership.organization.id,
        name: membership.organization.name,
        role: membership.role,
      })),
    };
  }

  private async issueTokenPair(
    userId: string,
    email: string,
    familyId: string,
  ): Promise<TokenPair> {
    const issued = this.tokenService.issueRefreshToken();
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: issued.tokenHash,
        familyId,
        expiresAt: issued.expiresAt,
      },
    });
    return {
      accessToken: this.tokenService.signAccessToken({
        sub: userId,
        email,
        type: 'organizer',
      }),
      expiresIn: this.tokenService.accessTokenExpiresInSeconds,
      refreshToken: issued.token,
      refreshTokenExpiresAt: issued.expiresAt,
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private buildVerifyEmailUrl(token: string): string {
    const adminWebUrl = this.configService.get<string>(
      'ADMIN_WEB_URL',
      'http://localhost:4300',
    );
    return `${adminWebUrl}/verify-email/${token}`;
  }

  private toUserSummary(user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  }): UserSummary {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }
}
