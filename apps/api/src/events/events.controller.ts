import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/auth.decorators.js';
import { AddPersonDto, CreateEventDto, CreateExpenseDto, EventsService, UpdateEventDto, UpdateExpenseDto } from './events.service.js';

/** People who share costs; reusable across events. */
@ApiTags('people')
@Controller('people')
export class PeopleController {
  constructor(private readonly events: EventsService) {}
  @Get() list(@CurrentUser() u: AuthUser) { return this.events.people(u.id); }
}

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get() list(@CurrentUser() u: AuthUser) { return this.events.list(u.id); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.events.get(u.id, id); }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateEventDto) { return this.events.create(u.id, dto); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateEventDto) { return this.events.update(u.id, id, dto); }
  @HttpCode(204) @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.events.remove(u.id, id); }

  @Post(':id/people') addPerson(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: AddPersonDto) { return this.events.addPerson(u.id, id, dto); }
  @HttpCode(204) @Delete(':id/people/:personId') removePerson(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('personId') personId: string) {
    return this.events.removePerson(u.id, id, personId);
  }

  @Post(':id/expenses') addExpense(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: CreateExpenseDto) { return this.events.addExpense(u.id, id, dto); }
  @HttpCode(204) @Patch(':id/expenses/:expenseId') updateExpense(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('expenseId') x: string, @Body() dto: UpdateExpenseDto) {
    return this.events.updateExpense(u.id, id, x, dto);
  }
  @HttpCode(204) @Delete(':id/expenses/:expenseId') removeExpense(@CurrentUser() u: AuthUser, @Param('id') id: string, @Param('expenseId') x: string) {
    return this.events.removeExpense(u.id, id, x);
  }
}
