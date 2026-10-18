import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthUser, CurrentUser } from '../common/auth.decorators.js';
import { CreateTransactionDto, ExportQuery, TransactionQuery, UpdateTransactionDto } from './dto.js';
import { TransactionsService } from './transactions.service.js';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly tx: TransactionsService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Query() q: TransactionQuery) { return this.tx.list(u.id, q); }

  @Get('export.csv') @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(@CurrentUser() u: AuthUser, @Query() q: ExportQuery, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
    return this.tx.exportCsv(u.id, q);
  }

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateTransactionDto) { return this.tx.create(u.id, dto); }

  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.tx.get(u.id, id); }

  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateTransactionDto) {
    return this.tx.update(u.id, id, dto);
  }

  @HttpCode(204) @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.tx.remove(u.id, id);
  }
}
