import { Module } from '@nestjs/common';
import { AutomationsController } from './automations.controller.js';
import { AutomationsScheduler } from './automations.scheduler.js';
import { AutomationsService } from './automations.service.js';

@Module({
  controllers: [AutomationsController],
  providers: [AutomationsService, AutomationsScheduler],
  exports: [AutomationsService],
})
export class AutomationsModule {}
