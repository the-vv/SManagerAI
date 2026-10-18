import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { APP_CONFIG, AppConfig } from '../common/config.js';
import { AutomationsService } from './automations.service.js';

/**
 * Database-backed scheduler. The source of truth is `Automation.nextRunDate`, not the timer,
 * so a restart or downtime loses nothing: on boot (and every tick) all due occurrences -
 * including missed ones - are processed idempotently. Single instance only (SQLite).
 */
@Injectable()
export class AutomationsScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(AutomationsScheduler.name);
  private running = false;

  constructor(
    private readonly automations: AutomationsService,
    private readonly registry: SchedulerRegistry,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.schedulerEnabled) {
      this.logger.warn('Scheduler disabled (SCHEDULER_ENABLED=false)');
      return;
    }
    const job = CronJob.from({ cronTime: this.config.schedulerCron, onTick: () => void this.tick(), start: true });
    this.registry.addCronJob('process-automations', job);
    await this.tick(); // catch up immediately after a restart
  }

  async tick(): Promise<void> {
    if (this.running) return; // never overlap runs
    this.running = true;
    try {
      const { processed } = await this.automations.processAllDue();
      if (processed > 0) this.logger.log(`Processed ${processed} scheduled occurrence(s)`);
    } catch (e) {
      this.logger.error(e instanceof Error ? e.stack : String(e));
    } finally {
      this.running = false;
    }
  }
}
