import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PasswordService } from '../auth/password.service';
import { TokenService } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlayerLoginDto } from './dto/player-login.dto';
import { PlayerRegisterDto } from './dto/player-register.dto';

export interface PlayerAccountSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface PlayerTokenPair {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

@Injectable()
export class PlayerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  async register(
    dto: PlayerRegisterDto,
  ): Promise<PlayerTokenPair & { playerAccount: PlayerAccountSummary }> {
    const existing = await this.prisma.playerAccount.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Un compte existe déjà avec cet email.');
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    const playerAccount = await this.prisma.playerAccount.create({
      data: {
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
      },
    });

    const tokens = await this.issueTokenPair(
      playerAccount.id,
      playerAccount.email,
      randomUUID(),
    );
    return { ...tokens, playerAccount: this.toSummary(playerAccount) };
  }

  async login(
    dto: PlayerLoginDto,
  ): Promise<PlayerTokenPair & { playerAccount: PlayerAccountSummary }> {
    const playerAccount = await this.prisma.playerAccount.findUnique({
      where: { email: dto.email },
    });
    if (
      !playerAccount ||
      !(await this.passwordService.verify(
        playerAccount.passwordHash,
        dto.password,
      ))
    ) {
      throw new UnauthorizedException('Identifiants invalides.');
    }

    const tokens = await this.issueTokenPair(
      playerAccount.id,
      playerAccount.email,
      randomUUID(),
    );
    return { ...tokens, playerAccount: this.toSummary(playerAccount) };
  }

  async refresh(presentedToken: string): Promise<PlayerTokenPair> {
    const tokenHash = this.tokenService.hashRefreshToken(presentedToken);
    const existing = await this.prisma.playerRefreshToken.findUnique({
      where: { tokenHash },
    });

    if (!existing) {
      throw new UnauthorizedException('Session invalide.');
    }

    if (existing.revokedAt) {
      await this.prisma.playerRefreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Session invalide.');
    }

    if (existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Session expirée.');
    }

    const playerAccount = await this.prisma.playerAccount.findUniqueOrThrow({
      where: { id: existing.playerAccountId },
    });
    const issued = this.tokenService.issueRefreshToken();

    await this.prisma.$transaction(async (tx) => {
      const newToken = await tx.playerRefreshToken.create({
        data: {
          playerAccountId: playerAccount.id,
          tokenHash: issued.tokenHash,
          familyId: existing.familyId,
          expiresAt: issued.expiresAt,
        },
      });
      await tx.playerRefreshToken.update({
        where: { id: existing.id },
        data: { revokedAt: new Date(), replacedByTokenId: newToken.id },
      });
    });

    return {
      accessToken: this.tokenService.signAccessToken({
        sub: playerAccount.id,
        email: playerAccount.email,
        type: 'player',
      }),
      expiresIn: this.tokenService.accessTokenExpiresInSeconds,
      refreshToken: issued.token,
      refreshTokenExpiresAt: issued.expiresAt,
    };
  }

  async logout(presentedToken: string): Promise<void> {
    const tokenHash = this.tokenService.hashRefreshToken(presentedToken);
    await this.prisma.playerRefreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getProfile(playerAccountId: string): Promise<PlayerAccountSummary> {
    const playerAccount = await this.prisma.playerAccount.findUniqueOrThrow({
      where: { id: playerAccountId },
    });
    return this.toSummary(playerAccount);
  }

  private async issueTokenPair(
    playerAccountId: string,
    email: string,
    familyId: string,
  ): Promise<PlayerTokenPair> {
    const issued = this.tokenService.issueRefreshToken();
    await this.prisma.playerRefreshToken.create({
      data: {
        playerAccountId,
        tokenHash: issued.tokenHash,
        familyId,
        expiresAt: issued.expiresAt,
      },
    });
    return {
      accessToken: this.tokenService.signAccessToken({
        sub: playerAccountId,
        email,
        type: 'player',
      }),
      expiresIn: this.tokenService.accessTokenExpiresInSeconds,
      refreshToken: issued.token,
      refreshTokenExpiresAt: issued.expiresAt,
    };
  }

  private toSummary(playerAccount: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  }): PlayerAccountSummary {
    return {
      id: playerAccount.id,
      email: playerAccount.email,
      firstName: playerAccount.firstName,
      lastName: playerAccount.lastName,
    };
  }
}
