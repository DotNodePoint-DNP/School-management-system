import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';

export const FEE_FREQUENCIES = [
  'ONE_TIME',
  'MONTHLY',
  'TERMLY',
  'YEARLY',
  'AD_HOC',
] as const;
export type FeeFrequencyValue = (typeof FEE_FREQUENCIES)[number];
const upperTrim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateFeeHeadDto {
  /** 2-20 capital letters, digits or underscores. Fixed once created. */
  @Transform(upperTrim)
  @Matches(/^[A-Z0-9_]{2,20}$/, {
    message: 'code must be 2-20 letters, digits or underscores',
  })
  code!: string;
  @Trim() @IsString() @MinLength(2) @MaxLength(80) name!: string;
  @IsOptional() @Trim() @IsString() @MaxLength(80) nameNp?: string;
  @IsIn(FEE_FREQUENCIES) frequency!: FeeFrequencyValue;
  /** Billed only to students it is assigned to, such as transport or hostel. */
  @IsOptional() @IsBoolean() perStudent?: boolean;
  @IsOptional() @Trim() @IsString() @MaxLength(30) incomeAccountCode?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
}

export class UpdateFeeHeadDto {
  @IsOptional() @Trim() @IsString() @MinLength(2) @MaxLength(80) name?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(80) nameNp?: string | null;
  @IsOptional() @IsIn(FEE_FREQUENCIES) frequency?: FeeFrequencyValue;
  @IsOptional() @IsBoolean() perStudent?: boolean;
  @IsOptional() @Trim() @IsString() @MaxLength(30) incomeAccountCode?:
    string | null;
  @IsOptional() @IsInt() @Min(0) @Max(1000) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
