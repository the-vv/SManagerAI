import { Transform } from 'class-transformer';
import {
  IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, MaxLength, Min,
} from 'class-validator';
import { MAX_AMOUNT_MINOR } from '../common/money.js';

const ACCOUNT_TYPES = ['BANK', 'SAVINGS', 'CASH', 'CREDIT_CARD'] as const;
const HEX = /^#[0-9a-fA-F]{6}$/;
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateAccountDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(80) name: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) institution?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(20) identifier?: string;
  @IsIn(ACCOUNT_TYPES) type: (typeof ACCOUNT_TYPES)[number];
  /** Signed minor units. For credit cards enter a negative number for money owed. */
  @IsOptional() @IsInt() @Min(-MAX_AMOUNT_MINOR) @Max(MAX_AMOUNT_MINOR) openingBalance?: number;
  /** Local date YYYY-MM-DD; defaults to today. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) openingDate?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @Matches(HEX, { message: 'color must be a #RRGGBB hex value' }) color?: string;
  @IsOptional() @IsString() @MaxLength(40) icon?: string;
}

export class UpdateAccountDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(80) name?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) institution?: string | null;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(20) identifier?: string | null;
  @IsOptional() @IsIn(ACCOUNT_TYPES) type?: (typeof ACCOUNT_TYPES)[number];
  @IsOptional() @IsInt() @Min(-MAX_AMOUNT_MINOR) @Max(MAX_AMOUNT_MINOR) openingBalance?: number;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) openingDate?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Matches(HEX) color?: string | null;
  @IsOptional() @IsString() @MaxLength(40) icon?: string | null;
}

export class CreateAdjustmentDto {
  /** Local date YYYY-MM-DD the correction applies to (end of that day); defaults to now. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(200) reason: string;
  /** Signed delta in minor units. Provide exactly one of amount / targetBalance. */
  @IsOptional() @IsInt() @Min(-MAX_AMOUNT_MINOR) @Max(MAX_AMOUNT_MINOR) amount?: number;
  /** The balance the account should show at the end of `date`; the delta is computed for you. */
  @IsOptional() @IsInt() @Min(-MAX_AMOUNT_MINOR) @Max(MAX_AMOUNT_MINOR) targetBalance?: number;
}
