import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class FeeLineDto {
  @IsUUID('all') feeHeadId!: string;
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000_000)
  amount!: number;
  /** Who pays it. NEW: students in their first enrollment ever. CONTINUING: everyone else. Default ALL. */
  @IsOptional() @IsIn(['ALL', 'NEW', 'CONTINUING']) audience?:
    'ALL' | 'NEW' | 'CONTINUING';
  /** Billed once, when a new student is admitted. Then no periods are given, and the audience is NEW. */
  @IsOptional() @IsBoolean() onAdmission?: boolean;
  /** The billing periods this fee applies to (for example tuition in every month). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  periodIds?: string[];
}

export class ReplaceFeeStructureDto {
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => FeeLineDto)
  lines!: FeeLineDto[];
}

export class CopyFeeStructureDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  classIds?: string[];
  /** Raise (or lower) every amount by this percentage while copying, rounded to the paisa. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-50)
  @Max(100)
  adjustPercent?: number;
}
