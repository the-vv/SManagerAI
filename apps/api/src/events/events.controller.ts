import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, Public } from '../common/auth.decorators.js';
import { RateLimit } from '../common/rate-limit.js';
import { AddPersonDto, CreateEventDto, CreateExpenseDto, EventsService, GuestExpenseDto, UpdateEventDto, UpdateExpenseDto, UpdateSharingDto } from './events.service.js';

/** People who share costs; reusable across events. */
@ApiTags('people')
@Controller('people')
export class PeopleController {
  constructor(private readonly events: EventsService) {}
  @Get() list(@CurrentUser() u: AuthUser) { return this.events.people(u.id); }
}

/** No sign-in: reachable only with the secret token of an event the owner chose to share. */
@ApiTags('public')
@Public()
@Controller('public/events')
export class PublicEventsController {
  constructor(private readonly events: EventsService) {}

  @RateLimit({ limit: 60, windowMs: 60_000 })
  @Get(':token') view(@Param('token') token: string) { return this.events.publicView(token); }

  @RateLimit({ limit: 15, windowMs: 60_000 })
  @HttpCode(204) @Post(':token/expenses') add(@Param('token') token: string, @Body() dto: GuestExpenseDto) { return this.events.addGuestExpense(token, dto); }
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

  @Patch(':id/sharing') sharing(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateSharingDto) { return this.events.updateSharing(u.id, id, dto); }

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
