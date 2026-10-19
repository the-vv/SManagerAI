import { Transform } from 'class-transformer';
import { IsInt, IsIn, IsNotEmpty, IsOptional, Max, Min, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ClassifyTransactionDto {
  /** Free text such as "Lunch 250". Length is also capped by AI_MAX_INPUT_CHARS in the service. */
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(500) text: string;
  /** Save to this account instead of the default one (must be the caller's own active account). */
  @IsOptional() @IsString() @MaxLength(64) accountId?: string;
}

export class ListJobsQuery {
  @IsOptional() @IsIn(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']) status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
}

export class SetAiLimitDto {
  /** Entries per day; null resets the user to the default. */
  @IsOptional() @IsInt() @Min(0) @Max(100000) dailyLimit?: number | null;
}
