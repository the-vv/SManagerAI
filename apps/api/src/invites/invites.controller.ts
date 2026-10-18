import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../common/admin.guard.js';
import { AuthUser, CurrentUser } from '../common/auth.decorators.js';
import { RateLimit } from '../common/rate-limit.js';
import { CreateInviteDto } from './dto.js';
import { InvitesService } from './invites.service.js';

/** Admin only. Everyone else gets 403. */
@ApiTags('invites')
@UseGuards(AdminGuard)
@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @RateLimit({ limit: 30, windowMs: 60_000 })
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateInviteDto) { return this.invites.create(u.id, dto); }

  @Get() list(@CurrentUser() u: AuthUser) { return this.invites.list(u.id); }

  @HttpCode(204) @Delete(':id') revoke(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.invites.revoke(u.id, id); }
}
