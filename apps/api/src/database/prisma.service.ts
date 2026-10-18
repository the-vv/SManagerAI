import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '../generated/prisma/client.js';

/** The Prisma transaction client type (what `$transaction(async (tx) => ...)` hands out). */
export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const url = process.env.DATABASE_URL ?? 'file:./dev.db';
    super({ adapter: new PrismaBetterSqlite3({ url }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    // WAL gives concurrent readers while a write is in progress; busy_timeout avoids
    // spurious SQLITE_BUSY errors; foreign keys are off by default in SQLite.
    await this.$queryRawUnsafe('PRAGMA journal_mode = WAL');
    await this.$queryRawUnsafe('PRAGMA busy_timeout = 5000');
    await this.$queryRawUnsafe('PRAGMA foreign_keys = ON');
    await this.$queryRawUnsafe('PRAGMA synchronous = NORMAL');
    this.logger.log('SQLite connected (WAL, foreign_keys=ON)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
