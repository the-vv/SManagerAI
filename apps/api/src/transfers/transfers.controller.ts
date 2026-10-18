import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/auth.decorators.js';
import { CreateTransferDto, UpdateTransferDto } from '../transactions/dto.js';
import { TransfersService } from './transfers.service.js';

@ApiTags('transfers')
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateTransferDto) { return this.transfers.create(u.id, dto); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.transfers.get(u.id, id); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateTransferDto) {
    return this.transfers.update(u.id, id, dto);
  }
  @HttpCode(204) @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.transfers.remove(u.id, id);
  }
}
