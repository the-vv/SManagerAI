import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminGuard } from '../common/admin.guard.js';
import { AuthUser, CurrentUser } from '../common/auth.decorators.js';
import { RateLimit } from '../common/rate-limit.js';
import { AiQueueService } from './ai-queue.service.js';
import { AiService } from './ai.service.js';
import { ClassifyTransactionDto, ListJobsQuery, SetAiLimitDto } from './dto/ai.dto.js';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService, private readonly queue: AiQueueService) {}

  @Get('status') status(@CurrentUser() u: AuthUser) { return this.ai.allowance(u.id); }

  /** Admin only: per-user daily limits (the default applies where none is set). */
  @UseGuards(AdminGuard) @Get('limits') limits() { return this.ai.limits(); }

  @UseGuards(AdminGuard) @Patch('limits/:userId')
  setLimit(@Param('userId') userId: string, @Body() dto: SetAiLimitDto) { return this.ai.setLimit(userId, dto.dailyLimit ?? null); }

  @RateLimit({ limit: 30, windowMs: 60_000 })
  @HttpCode(202)
  @Post('transactions/classify')
  classify(@CurrentUser() u: AuthUser, @Body() dto: ClassifyTransactionDto) { return this.ai.submit(u.id, dto.text, dto.accountId); }

  /** Everything the user should see: waiting, processing, needs-review, failed and recently added. */
  @Get('queue') queueOf(@CurrentUser() u: AuthUser) { return this.queue.openForUser(u.id); }

  @HttpCode(200) @Post('queue/clear') async clear(@CurrentUser() u: AuthUser) { return { cleared: await this.queue.clearDone(u.id) }; }

  /** Remove an entry from the queue (see AiQueueService.remove). */
  @HttpCode(204) @Delete('jobs/:jobId') remove(@CurrentUser() u: AuthUser, @Param('jobId') jobId: string) { return this.queue.remove(u.id, jobId); }

  @Get('jobs') list(@CurrentUser() u: AuthUser, @Query() q: ListJobsQuery) { return this.queue.listForUser(u.id, q.status); }

  @Get('jobs/:jobId') get(@CurrentUser() u: AuthUser, @Param('jobId') jobId: string) { return this.queue.getForUser(u.id, jobId); }
}
