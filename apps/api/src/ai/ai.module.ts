import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { AiClassificationService } from './ai-classification.service.js';
import { AiQueueService } from './ai-queue.service.js';
import { AiSchedulerService } from './ai-scheduler.service.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';
import { OllamaClient } from './ollama.client.js';

@Module({
  imports: [TransactionsModule],
  controllers: [AiController],
  providers: [OllamaClient, AiQueueService, AiClassificationService, AiService, AiSchedulerService],
  exports: [AiService],
})
export class AiModule {}
