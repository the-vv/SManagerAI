import { Controller, Get, Header, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { Response } from 'express';
import { AuthUser, CurrentUser } from '../common/auth.decorators.js';
import { ReportsService } from './reports.service.js';

class ReportQueryDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsString() accountId?: string;
}

class ExportReportQueryDto extends ReportQueryDto {
  @IsIn(['monthly', 'expense-categories', 'income-categories', 'accounts', 'recurring', 'largest'])
  section: string;
}

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get() overview(@CurrentUser() u: AuthUser, @Query() q: ReportQueryDto) { return this.reports.overview(u.id, q); }

  @Get('export.csv') @Header('Content-Type', 'text/csv; charset=utf-8')
  async export(@CurrentUser() u: AuthUser, @Query() q: ExportReportQueryDto, @Res({ passthrough: true }) res: Response) {
    res.setHeader('Content-Disposition', `attachment; filename="report-${q.section}.csv"`);
    return this.reports.exportCsv(u.id, q, q.section);
  }
}
