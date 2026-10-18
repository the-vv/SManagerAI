import { Global, Module } from '@nestjs/common';
import { LedgerService } from './ledger.service.js';
import { TransactionWriter } from './transaction-writer.js';

@Global()
@Module({ providers: [LedgerService, TransactionWriter], exports: [LedgerService, TransactionWriter] })
export class LedgerModule {}
