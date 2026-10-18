import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUser } from './auth.decorators.js';

/** Runs after the global session guard, so `request.user` is already the authenticated user. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user?.isAdmin) throw new ForbiddenException('Only an administrator can do this');
    return true;
  }
}
