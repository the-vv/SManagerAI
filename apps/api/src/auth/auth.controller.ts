import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RateLimit } from '../common/rate-limit.js';
import { Request, Response } from 'express';
import { APP_CONFIG, AppConfig } from '../common/config.js';
import { AuthUser, CurrentUser, Public } from '../common/auth.decorators.js';
import { SESSION_COOKIE } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { ChangePasswordDto, GoogleLoginDto, LoginDto, RegisterDto } from './dto.js';

const STRICT = { limit: 10, windowMs: 60_000 };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** Browsers get an httpOnly cookie. The native app (X-Client: native) also gets the token in
   *  the body, because cross-origin cookies are unreliable inside a WebView. */
  private respond(req: Request, res: Response, r: { user: unknown; token: string; expiresAt: Date }) {
    res.cookie(SESSION_COOKIE, r.token, {
      httpOnly: true, secure: this.config.cookieSecure, sameSite: 'lax', path: '/', expires: r.expiresAt,
    });
    const native = req.headers['x-client'] === 'native';
    return { user: r.user, expiresAt: r.expiresAt, ...(native ? { token: r.token } : {}) };
  }

  @Public() @Get('config')
  publicConfig() {
    return this.auth.registrationOpen.then((registrationOpen) => ({
      registrationOpen, googleClientId: this.config.googleClientId ?? null,
    }));
  }

  @Public() @RateLimit(STRICT) @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(req, res, await this.auth.register(dto.email, dto.password, dto.name, req.headers['user-agent']));
  }

  @Public() @RateLimit(STRICT) @HttpCode(200) @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(req, res, await this.auth.login(dto.email, dto.password, req.headers['user-agent']));
  }

  @Public() @RateLimit(STRICT) @HttpCode(200) @Post('google')
  async google(@Body() dto: GoogleLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.respond(req, res, await this.auth.loginWithGoogle(dto.idToken, req.headers['user-agent']));
  }

  @HttpCode(204) @Post('logout')
  async logout(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(user);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return { id: user.id, email: user.email, name: user.name };
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser) {
    return this.auth.listSessions(user);
  }

  @HttpCode(204) @Delete('sessions/:id')
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.auth.revokeSession(user, id);
  }

  @HttpCode(204) @Post('sessions/revoke-others')
  revokeOthers(@CurrentUser() user: AuthUser) {
    return this.auth.revokeOtherSessions(user);
  }

  @RateLimit(STRICT) @HttpCode(204) @Post('change-password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(user, dto.currentPassword, dto.newPassword);
  }
}
