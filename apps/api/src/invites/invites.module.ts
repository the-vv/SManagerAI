import { Global, Module } from '@nestjs/common';
import { InvitesController } from './invites.controller.js';
import { InvitesService } from './invites.service.js';

@Global()
@Module({ controllers: [InvitesController], providers: [InvitesService], exports: [InvitesService] })
export class InvitesModule {}
