import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';
import { SuperAdminLoginDto } from './dto/super-admin-login.dto';

export interface SuperAdminSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface SuperAdminTokenPair {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

// No register() here, deliberately -- SuperAdminAccount rows only ever come
// from apps/api/prisma/create-super-admin.ts, run by hand. This service is
// login/refresh/logout/profile only, same rotation-with-family-revocation
// shape as AuthService/PlayerAuthService.
@Injectable()
export class SuperAdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async login(
    dto: SuperAdminLoginDto,
  ): Promise<SuperAdminTokenPair & { superAdmin: SuperAdminSummary }> {
    const superAdmin = await this.prisma.superAdminAccount.findUnique({
      where: { email: dto.email },
    });
    if (
      !superAdmin ||
      !(await this.passwordService.verify(
        superAdmin.passwordHash,
        dto.password,
      ))
    ) {
      throw new UnauthorizedException('Identifiants invalides.');
    }

    const tokens = await this.issueTokenPair(
      superAdmin.id,
      superAdmin.email,
      randomUUID(),
    );
    return { ...tokens, superAdmin: this.toSummary(superAdmin) };
  }

  async refresh(presentedToken: string): Promise<SuperAdminTokenPair> {
    const tokenHash = this.tokenService.hashRefreshToken(presentedToken);
    const existing = await this.prisma.superAdminRefreshToken.findUnique({
      where: { tokenHash },
    });

    if (!existing) {
      throw new UnauthorizedException('Session invalide.');
    }

    if (existing.revokedAt) {
      // A previously-rotated-out token is being replayed: treat as a theft
      // signal and revoke the whole rotation chain, forcing a fresh login.
      await this.prisma.superAdminRefreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Session invalide.');
    }

    if (existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expirée.');
    }

    const superAdmin = await this.prisma.superAdminAccount.findUniqueOrThrow({
      where: { id: existing.superAdminId },
    });
    const issued = this.tokenService.issueRefreshToken();

    await this.prisma.$transaction(async (tx) => {
      const newToken = await tx.superAdminRefreshToken.create({
        data: {
          superAdminId: superAdmin.id,
          tokenHash: issued.tokenHash,
          familyId: existing.familyId,
          expiresAt: issued.expiresAt,
        },
      });
      await tx.superAdminRefreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), replacedByTokenId: newToken.id },
      });
    });

    return {
      accessToken: this.tokenService.signAccessToken({
        sub: superAdmin.id,
        email: superAdmin.email,
        type: 'super-admin',
      }),
      expiresIn: this.tokenService.accessTokenExpiresInSeconds,
      refreshToken: issued.token,
      refreshTokenExpiresAt: issued.expiresAt,
    };
  }

  async logout(presentedToken: string): Promise<void> {
    const tokenHash = this.tokenService.hashRefreshToken(presentedToken);
    await this.prisma.superAdminRefreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getProfile(superAdminId: string): Promise<SuperAdminSummary> {
    const superAdmin = await this.prisma.superAdminAccount.findUniqueOrThrow({
      where: { id: superAdminId },
    });
    return this.toSummary(superAdmin);
  }

  private async issueTokenPair(
    superAdminId: string,
    email: string,
    familyId: string,
  ): Promise<SuperAdminTokenPair> {
    const issued = this.tokenService.issueRefreshToken();
    await this.prisma.superAdminRefreshToken.create({
      data: {
        superAdminId,
        tokenHash: issued.tokenHash,
        familyId,
        expiresAt: issued.expiresAt,
      },
    });
    return {
      accessToken: this.tokenService.signAccessToken({
        sub: superAdminId,
        email,
        type: 'super-admin',
      }),
      expiresIn: this.tokenService.accessTokenExpiresInSeconds,
      refreshToken: issued.token,
      refreshTokenExpiresAt: issued.expiresAt,
    };
  }

  private toSummary(superAdmin: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  }): SuperAdminSummary {
    return {
      id: superAdmin.id,
      email: superAdmin.email,
      firstName: superAdmin.firstName,
      lastName: superAdmin.lastName,
    };
  }
}
