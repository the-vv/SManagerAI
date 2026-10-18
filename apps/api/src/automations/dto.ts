import { Transform } from 'class-transformer';
import {
  IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min,
} from 'class-validator';
import { MAX_AMOUNT_MINOR } from '../common/money.js';
import { FREQUENCIES } from '../transactions/dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateAutomationDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120) title: string;
  @IsIn(['INCOME', 'EXPENSE']) kind: 'INCOME' | 'EXPENSE';
  @IsInt() @Min(1) @Max(MAX_AMOUNT_MINOR) amount: number;
  @IsString() @IsNotEmpty() accountId: string;
  @IsOptional() @IsString() categoryId?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) description?: string;
  @IsIn(FREQUENCIES) frequency: (typeof FREQUENCIES)[number];
  @IsOptional() @IsInt() @Min(1) @Max(365) customEvery?: number;
  @IsOptional() @IsIn(['DAY', 'WEEK', 'MONTH']) customUnit?: 'DAY' | 'WEEK' | 'MONTH';
  @IsOptional() @IsInt() @Min(1) @Max(31) dayOfMonth?: number;
  @Matches(DATE) startDate: string;
  @IsOptional() @Matches(DATE) endDate?: string | null;
  @IsOptional() @IsIn(['AUTO', 'REMINDER']) mode?: 'AUTO' | 'REMINDER';
  @IsOptional() @IsInt() @Min(0) @Max(30) reminderDaysBefore?: number;
  /** If the start date is in the past: true records the missed past occurrences, false (default) starts from today. */
  @IsOptional() @IsBoolean() backfill?: boolean;
}

export class UpdateAutomationDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120) title?: string;
  @IsOptional() @IsIn(['INCOME', 'EXPENSE']) kind?: 'INCOME' | 'EXPENSE';
  @IsOptional() @IsInt() @Min(1) @Max(MAX_AMOUNT_MINOR) amount?: number;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() categoryId?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) description?: string | null;
  @IsOptional() @IsIn(FREQUENCIES) frequency?: (typeof FREQUENCIES)[number];
  @IsOptional() @IsInt() @Min(1) @Max(365) customEvery?: number | null;
  @IsOptional() @IsIn(['DAY', 'WEEK', 'MONTH']) customUnit?: 'DAY' | 'WEEK' | 'MONTH' | null;
  @IsOptional() @IsInt() @Min(1) @Max(31) dayOfMonth?: number | null;
  @IsOptional() @Matches(DATE) startDate?: string;
  @IsOptional() @Matches(DATE) endDate?: string | null;
  @IsOptional() @IsIn(['AUTO', 'REMINDER']) mode?: 'AUTO' | 'REMINDER';
  @IsOptional() @IsInt() @Min(0) @Max(30) reminderDaysBefore?: number;
  @IsOptional() @IsBoolean() isEnabled?: boolean;
}

export class ConfirmExecutionDto {
  /** Override the amount if the real bill differs. */
  @IsOptional() @IsInt() @Min(1) @Max(MAX_AMOUNT_MINOR) amount?: number;
  /** Local date YYYY-MM-DD the payment actually happened. Defaults to the scheduled date. */
  @IsOptional() @Matches(DATE) date?: string;
}
