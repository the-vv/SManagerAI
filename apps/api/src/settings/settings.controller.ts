import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/auth.decorators.js';
import { UpdateSettingsDto } from './dto.js';
import { SettingsService } from './settings.service.js';

@ApiTags('settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get() get(@CurrentUser() u: AuthUser) { return this.settings.get(u.id); }

  @Patch() update(@CurrentUser() u: AuthUser, @Body() dto: UpdateSettingsDto) {
    return this.settings.update(u.id, dto);
  }
}
