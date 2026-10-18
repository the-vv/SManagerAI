import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC } from '../common/auth.decorators.js';
import { AuthService } from './auth.service.js';

export const SESSION_COOKIE = 'sm_session';

export function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return (req as Request & { cookies?: Record<string, string> }).cookies?.[SESSION_COOKIE];
}

/** Registered globally: every route requires a valid session unless marked @Public(). */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const token = extractToken(req);
    const user = token ? await this.auth.authenticate(token) : null;
    if (!user) throw new UnauthorizedException('Not authenticated');
    (req as Request & { user?: unknown }).user = user;
    return true;
  }
}
