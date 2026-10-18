import { Transform, Type } from 'class-transformer';
import {
  IsBoolean, IsIn, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min,
  ValidateNested,
} from 'class-validator';
import { MAX_AMOUNT_MINOR } from '../common/money.js';
import { PageQuery } from '../common/pagination.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const toBool = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);

export const FREQUENCIES = [
  'DAILY', 'WEEKLY', 'MONTHLY', 'BIMONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM',
] as const;

/** Inline "also make this recurring" block of the quick-add form. */
export class InlineAutomationDto {
  @IsIn(FREQUENCIES) frequency: (typeof FREQUENCIES)[number];
  @IsOptional() @IsInt() @Min(1) @Max(365) customEvery?: number;
  @IsOptional() @IsIn(['DAY', 'WEEK', 'MONTH']) customUnit?: 'DAY' | 'WEEK' | 'MONTH';
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) endDate?: string;
  @IsOptional() @IsIn(['AUTO', 'REMINDER']) mode?: 'AUTO' | 'REMINDER';
}

export class CreateTransactionDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120) title: string;
  /** Positive integer, minor units (paise). */
  @IsInt({ message: 'amount must be a whole number of minor units' })
  @Min(1, { message: 'amount must be greater than zero' }) @Max(MAX_AMOUNT_MINOR)
  amount: number;
  @IsIn(['INCOME', 'EXPENSE']) kind: 'INCOME' | 'EXPENSE';
  @IsOptional() @IsString() categoryId?: string | null;
  @IsOptional() @IsString() accountId?: string;
  /** ISO-8601 instant. Defaults to now. */
  @IsOptional() @IsISO8601() occurredAt?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @ValidateNested() @Type(() => InlineAutomationDto) automation?: InlineAutomationDto;
}

export class UpdateTransactionDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(120) title?: string;
  @IsOptional() @IsInt() @Min(1) @Max(MAX_AMOUNT_MINOR) amount?: number;
  @IsOptional() @IsIn(['INCOME', 'EXPENSE']) kind?: 'INCOME' | 'EXPENSE';
  @IsOptional() @IsString() categoryId?: string | null;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsISO8601() occurredAt?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(1000) notes?: string | null;
}

export class TransactionQuery extends PageQuery {
  /** YYYY-MM */
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month?: string;
  /** Local dates, inclusive. Ignored when `month` is given. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsIn(['INCOME', 'EXPENSE', 'TRANSFER']) kind?: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  @IsOptional() @IsString() categoryId?: string;
  /** 'none' = uncategorized */
  @IsOptional() @IsIn(['MANUAL', 'AUTOMATION']) origin?: 'MANUAL' | 'AUTOMATION';
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(['date', 'amount', 'title']) sort?: 'date' | 'amount' | 'title';
  @IsOptional() @IsIn(['asc', 'desc']) dir?: 'asc' | 'desc';
}

export class ExportQuery {
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsIn(['INCOME', 'EXPENSE', 'TRANSFER']) kind?: 'INCOME' | 'EXPENSE' | 'TRANSFER';
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsIn(['MANUAL', 'AUTOMATION']) origin?: 'MANUAL' | 'AUTOMATION';
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) q?: string;
}

export class CreateTransferDto {
  @IsString() @IsNotEmpty() fromAccountId: string;
  @IsString() @IsNotEmpty() toAccountId: string;
  @IsInt() @Min(1) @Max(MAX_AMOUNT_MINOR) amount: number;
  @IsOptional() @IsISO8601() occurredAt?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) note?: string;
}

export class UpdateTransferDto {
  @IsOptional() @IsString() fromAccountId?: string;
  @IsOptional() @IsString() toAccountId?: string;
  @IsOptional() @IsInt() @Min(1) @Max(MAX_AMOUNT_MINOR) amount?: number;
  @IsOptional() @IsISO8601() occurredAt?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) note?: string | null;
}

export { toBool };
