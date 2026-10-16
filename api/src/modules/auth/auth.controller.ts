import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthUser, RequestMeta } from './auth.types.js';
import { AuthService } from './auth.service.js';
import { AllowPendingPasswordChange } from './decorators/allow-pending-password-change.decorator.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { LoginDto } from './dto/login.dto.js';

const REFRESH_COOKIE = 'refresh_token';
const COOKIE_PATH = '/api/v1/auth';

function requestMeta(req: Request): RequestMeta {
  return {
    userAgent: req.headers['user-agent']?.slice(0, 255) ?? null,
    ipAddress: req.ip ?? null,
  };
}

@Controller('auth')
export class AuthController {
  private readonly isProduction: boolean;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.isProduction = config.get<string>('NODE_ENV') === 'production';
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; expiresIn: number; user: AuthUser }> {
    const session = await this.auth.login(dto, requestMeta(req));
    this.setRefreshCookie(res, session.refreshToken, session.refreshExpiresAt);
    return {
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: session.user,
    };
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ accessToken: string; expiresIn: number; user: AuthUser }> {
    try {
      const session = await this.auth.refresh(
        this.readRefreshCookie(req),
        requestMeta(req),
      );
      this.setRefreshCookie(
        res,
        session.refreshToken,
        session.refreshExpiresAt,
      );
      return {
        accessToken: session.accessToken,
        expiresIn: session.expiresIn,
        user: session.user,
      };
    } catch (error) {
      this.clearRefreshCookie(res);
      throw error;
    }
  }

  @Public()
  @HttpCode(200)
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ loggedOut: true }> {
    await this.auth.logout(this.readRefreshCookie(req));
    this.clearRefreshCookie(res);
    return { loggedOut: true };
  }

  @AllowPendingPasswordChange()
  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }

  @AllowPendingPasswordChange()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ passwordChanged: true }> {
    await this.auth.changePassword(user.id, dto);
    this.clearRefreshCookie(res);
    return { passwordChanged: true };
  }

  private readRefreshCookie(req: Request): string | undefined {
    return (req.cookies as Record<string, string | undefined> | undefined)?.[
      REFRESH_COOKIE
    ];
  }

  private setRefreshCookie(res: Response, token: string, expires: Date): void {
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'strict',
      path: COOKIE_PATH,
      expires,
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'strict',
      path: COOKIE_PATH,
    });
  }
}
