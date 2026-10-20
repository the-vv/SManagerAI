import { Module } from '@nestjs/common';
import { EventsController, PeopleController, PublicEventsController } from './events.controller.js';
import { EventsService } from './events.service.js';

@Module({ controllers: [EventsController, PeopleController, PublicEventsController], providers: [EventsService] })
export class EventsModule {}
