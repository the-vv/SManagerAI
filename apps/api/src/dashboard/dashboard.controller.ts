import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/auth.decorators.js';
import { DashboardService } from './dashboard.service.js';

class DashboardQuery {
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month?: string;
  @IsOptional() @IsString() accountId?: string;
}

@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get() get(@CurrentUser() u: AuthUser, @Query() q: DashboardQuery) { return this.dashboard.get(u.id, q); }
}
