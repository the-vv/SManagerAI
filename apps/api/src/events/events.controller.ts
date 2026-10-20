import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/auth.decorators.js';
import { CreateEventDto, EventsService, UpdateEventDto } from './events.service.js';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get() list(@CurrentUser() u: AuthUser) { return this.events.list(u.id); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.events.get(u.id, id); }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateEventDto) { return this.events.create(u.id, dto); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateEventDto) { return this.events.update(u.id, id, dto); }
  @HttpCode(204) @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.events.remove(u.id, id); }
}
