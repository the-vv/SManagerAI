import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

const KEY = 'rateLimit';
export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}
/** Per-client-IP, per-route limit for sensitive endpoints (login, register, password change). */
export const RateLimit = (opts: RateLimitOptions) => SetMetadata(KEY, opts);

/**
 * Tiny in-memory fixed-window limiter. Appropriate here because the app is single-instance
 * by design (SQLite). Client IP comes from Express `trust proxy` (set in main.ts).
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const opts = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!opts || process.env.RATE_LIMIT_ENABLED === 'false') return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const key = `${req.ip}:${req.method}:${req.route?.path ?? req.path}`;
    const now = Date.now();
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    const e = this.hits.get(key);
    if (!e || e.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      return true;
    }
    if (++e.count > opts.limit) {
      throw new HttpException('Too many attempts. Try again in a minute.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}
