import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { RateLimitGuard } from './common/rate-limit.js';
import { AiModule } from './ai/ai.module.js';
import { AccountsModule } from './accounts/accounts.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AutomationsModule } from './automations/automations.module.js';
import { CategoriesModule } from './categories/categories.module.js';
import { APP_CONFIG, loadConfig } from './common/config.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { LedgerModule } from './ledger/ledger.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { SettingsModule } from './settings/settings.module.js';
import { TransactionsModule } from './transactions/transactions.module.js';
import { TransfersModule } from './transfers/transfers.module.js';
import { UsersModule } from './users/users.module.js';
import { Global } from '@nestjs/common';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }],
  exports: [APP_CONFIG],
})
class ConfigModule {}

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    DatabaseModule, LedgerModule, SettingsModule, UsersModule, AuthModule,
    AccountsModule, CategoriesModule, TransactionsModule, TransfersModule,
    AutomationsModule, ReportsModule, DashboardModule, AiModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class AppModule {}
