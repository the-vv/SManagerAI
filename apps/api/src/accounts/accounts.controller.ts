import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/auth.decorators.js';
import { AccountsService } from './accounts.service.js';
import { CreateAccountDto, CreateAdjustmentDto, UpdateAccountDto } from './dto.js';

@ApiTags('accounts')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  /** ?date=YYYY-MM-DD returns balances as of the end of that day. */
  @Get() overview(@CurrentUser() u: AuthUser, @Query('date') date?: string) {
    return this.accounts.overview(u.id, { date });
  }

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateAccountDto) {
    return this.accounts.create(u.id, dto);
  }

  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.accounts.get(u.id, id); }

  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateAccountDto) {
    return this.accounts.update(u.id, id, dto);
  }

  @HttpCode(200) @Post(':id/default')
  setDefault(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.accounts.setDefault(u.id, id); }

  @HttpCode(204) @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.accounts.remove(u.id, id); }

  @Get(':id/adjustments')
  adjustments(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.accounts.listAdjustments(u.id, id); }

  @Post(':id/adjustments')
  addAdjustment(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CreateAdjustmentDto) {
    return this.accounts.createAdjustment(u.id, id, dto);
  }

  @HttpCode(204) @Delete(':id/adjustments/:adjustmentId')
  removeAdjustment(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('adjustmentId') adjId: string) {
    return this.accounts.removeAdjustment(u.id, id, adjId);
  }
}
