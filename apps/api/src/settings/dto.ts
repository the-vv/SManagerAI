import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional() @IsString() @MaxLength(8) currency?: string;
  @IsOptional() @IsString() @MaxLength(20) locale?: string;
  @IsOptional() @IsString() @MaxLength(64) timezone?: string;
  @IsOptional() @IsIn(['dark', 'light']) theme?: string;
  @IsOptional() @IsString() @MaxLength(30) dateFormat?: string;
  @IsOptional() @IsIn(['12h', '24h']) timeFormat?: string;
  @IsOptional() @IsBoolean() useCategoryColors?: boolean;
  @IsOptional() @IsIn(['INCOME', 'EXPENSE']) defaultTxKind?: 'INCOME' | 'EXPENSE';
  @IsOptional() @IsIn(['AUTO', 'REMINDER']) defaultAutomationMode?: 'AUTO' | 'REMINDER';
  @IsOptional() @IsInt() @Min(0) @Max(30) reminderDaysBefore?: number;
}
