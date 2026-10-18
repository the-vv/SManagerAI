import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateInviteDto {
  /** Who the invite is for - only shown to the admin. */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) note?: string;
  @IsOptional() @IsInt() @Min(1) @Max(30) expiresInDays?: number;
}
