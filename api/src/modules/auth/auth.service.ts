import { randomBytes, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { sha256 } from '../../common/utils/hash.js';
import { parseIdentifier } from '../../common/utils/identifier.js';
import { hashPassword, verifyPassword } from '../../common/utils/password.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  AccessTokenPayload,
  AuthUser,
  IssuedSession,
  RequestMeta,
} from './auth.types.js';
import type { ChangePasswordDto } from './dto/change-password.dto.js';
import type { LoginDto } from './dto/login.dto.js';

// Two tabs may refresh at the same moment; only treat reuse as theft after this window.
const REUSE_GRACE_MS = 10_000;

@Injectable()
export class AuthService {
  private readonly refreshTtlMs: number;
  private readonly accessTtlSeconds: number;
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.refreshTtlMs =
      config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS') * 86_400_000;
    this.accessTtlSeconds = config.getOrThrow<number>('JWT_ACCESS_TTL_SECONDS');
  }

  async login(dto: LoginDto, meta: RequestMeta): Promise<IssuedSession> {
    const identifier = parseIdentifier(dto.identifier);
    const user = identifier
      ? await this.prisma.user.findUnique({
          where: identifier,
          select: { id: true, passwordHash: true, isActive: true },
        })
      : null;

    // Always run one hash verification so timing doesn't reveal whether the account exists.
    console.log('Incoming password:', dto.password);
    const valid = await verifyPassword(
      user?.passwordHash ?? (await this.getDummyHash()),
      dto.password,
    );
    console.log('user:', user, 'valid:', valid);
    if (!user || !user.isActive || !valid)
      throw new UnauthorizedException('Invalid credentials');

    const authUser = await this.loadAuthUser(user.id);
    if (!authUser) throw new UnauthorizedException('Invalid credentials ');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    const refresh = await this.createRefreshToken(user.id, randomUUID(), meta);
    return this.buildSession(authUser, refresh);
  }

  async refresh(
    rawToken: string | undefined,
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    const invalid = (): UnauthorizedException =>
      new UnauthorizedException('Invalid refresh token');
    if (!rawToken) throw invalid();

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
    });
    if (!stored) throw invalid();

    const now = new Date();
    if (stored.revokedAt) {
      // A rotated token was presented again: treat as theft and end the whole login family.
      if (now.getTime() - stored.revokedAt.getTime() > REUSE_GRACE_MS) {
        await this.revokeFamily(stored.familyId);
      }
      throw invalid();
    }
    if (stored.expiresAt <= now) throw invalid();

    const user = await this.loadAuthUser(stored.userId);
    if (!user) {
      await this.revokeFamily(stored.familyId);
      throw invalid();
    }

    // Atomic claim: only one concurrent request can rotate this token.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    if (claimed.count !== 1) throw invalid();

    const refresh = await this.createRefreshToken(
      user.id,
      stored.familyId,
      meta,
    );
    return this.buildSession(user, refresh);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
    });
    if (stored) await this.revokeFamily(stored.familyId);
  }

  async authenticate(accessToken: string): Promise<AuthUser> {
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(accessToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
    const user = await this.loadAuthUser(payload.sub);
    if (!user) throw new UnauthorizedException('Invalid or expired token');
    return user;
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (
      !user ||
      !(await verifyPassword(user.passwordHash, dto.currentPassword))
    ) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (dto.newPassword === dto.currentPassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }

    const passwordHash = await hashPassword(dto.newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, mustChangePassword: false },
      }),
      // Every device must sign in again with the new password.
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private getDummyHash(): Promise<string> {
    return (this.dummyHash ??= hashPassword(randomBytes(16).toString('hex')));
  }

  private revokeFamily(familyId: string): Promise<unknown> {
    return this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async createRefreshToken(
    userId: string,
    familyId: string,
    meta: RequestMeta,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.refreshTtlMs);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(token),
        expiresAt,
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    });
    return { token, expiresAt };
  }

  private async buildSession(
    user: AuthUser,
    refresh: { token: string; expiresAt: Date },
  ): Promise<IssuedSession> {
    const payload: AccessTokenPayload = { sub: user.id };
    return {
      accessToken: await this.jwt.signAsync(payload),
      expiresIn: this.accessTtlSeconds,
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
      user,
    };
  }

  private async loadAuthUser(userId: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        isActive: true,
        mustChangePassword: true,
        roles: {
          select: {
            role: {
              select: {
                name: true,
                permissions: {
                  select: {
                    permission: { select: { module: true, action: true } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!user || !user.isActive) return null;

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      mustChangePassword: user.mustChangePassword,
      roles: user.roles.map((r) => r.role.name),
      permissions: [
        ...new Set(
          user.roles.flatMap((r) =>
            r.role.permissions.map(
              (p) => `${p.permission.module}:${p.permission.action}`,
            ),
          ),
        ),
      ],
    };
  }
}
