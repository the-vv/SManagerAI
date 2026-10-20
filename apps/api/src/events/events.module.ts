import { Module } from '@nestjs/common';
import { EventsController, PeopleController } from './events.controller.js';
import { EventsService } from './events.service.js';

@Module({ controllers: [EventsController, PeopleController], providers: [EventsService] })
export class EventsModule {}
