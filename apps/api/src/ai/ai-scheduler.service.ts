import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../common/config.js';
import { AiService } from './ai.service.js';

/** Fires AI batches on a fixed interval. The only thing that ever triggers model calls. */
@Injectable()
export class AiSchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AiSchedulerService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly ai: AiService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.ai.enabled) { this.logger.log('AI disabled (OLLAMA_BASE_URL not set)'); return; }
    await this.ai.recoverAfterRestart().catch((e) => this.logger.error(String(e)));
    if (!this.config.schedulerEnabled) return;
    this.timer = setInterval(() => void this.tick(), this.config.ai.intervalSeconds * 1000);
    this.timer.unref();
    this.logger.log(`AI batches every ${this.config.ai.intervalSeconds}s (up to ${this.config.ai.batchSize} jobs)`);
  }

  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }

  async tick(): Promise<void> {
    try { await this.ai.processBatch(); } catch (e) { this.logger.error(e instanceof Error ? e.message : String(e)); }
  }
}
