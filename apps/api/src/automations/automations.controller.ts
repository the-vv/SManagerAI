import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/auth.decorators.js';
import { AutomationsService } from './automations.service.js';
import { ConfirmExecutionDto, CreateAutomationDto, UpdateAutomationDto } from './dto.js';

@ApiTags('automations')
@Controller('automations')
export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Get() list(@CurrentUser() u: AuthUser) { return this.automations.list(u.id); }

  @Get('upcoming') upcoming(@CurrentUser() u: AuthUser, @Query('days') days?: string, @Query('accountId') accountId?: string) {
    return this.automations.upcoming(u.id, { days: days ? Math.min(Number(days) || 30, 365) : 30, accountId });
  }

  @Get('notifications') notifications(@CurrentUser() u: AuthUser) { return this.automations.notifications(u.id); }

  @Get('pending') pending(@CurrentUser() u: AuthUser) { return this.automations.pending(u.id); }

  @HttpCode(204) @Post('executions/:id/confirm')
  confirm(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: ConfirmExecutionDto) {
    return this.automations.confirmExecution(u.id, id, dto);
  }

  @HttpCode(204) @Post('executions/:id/skip')
  skip(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.automations.skipExecution(u.id, id); }

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateAutomationDto) { return this.automations.create(u.id, dto); }

  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.automations.get(u.id, id); }

  @Get(':id/executions') executions(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.automations.executions(u.id, id);
  }

  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateAutomationDto) {
    return this.automations.update(u.id, id, dto);
  }

  @HttpCode(204) @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.automations.remove(u.id, id);
  }
}
