import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { DATE_SHAPE } from '../../../common/dto/date-range-input.dto.js';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export class SetLateFeePolicyDto {
  @IsBoolean() enabled!: boolean;
  @IsIn(['FIXED', 'PERCENT']) type!: 'FIXED' | 'PERCENT';
  /** FIXED: rupees. PERCENT: a percentage up to 100 (of the unpaid amount, applied once). */
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1_000_000) value!: number;
  /** Days after the due date before a fine can be applied. */
  @IsInt() @Min(0) @Max(365) graceDays!: number;
  /** Invoices with less than this unpaid are never fined. Default 1. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  minOutstanding?: number;
  /** The most any one fine can be. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000_000)
  maxFine?: number;
  @IsOptional() @IsBoolean() fineAdmission?: boolean;
  /** Invoices due before this date are never fined. Default: today, so nothing in the past is fined. */
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'appliesFromDueDate must be YYYY-MM-DD' })
  appliesFromDueDate?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'appliesFromDueDateBs must be YYYY-MM-DD' })
  appliesFromDueDateBs?: string;
  /** An active ad-hoc fee head. Default: the seeded FINE head. */
  @IsOptional() @IsUUID('all') feeHeadId?: string;
}

export class ExpectFinesDto {
  @IsInt() @Min(0) count!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) total!: number;
}

export class LateFineRunDto {
  @IsOptional() @IsUUID('all') classId?: string;
  @IsOptional() @IsUUID('all') sectionId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  studentIds?: string[];
  /** The figures from the preview. If they have changed, nothing is created. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ExpectFinesDto)
  expect?: ExpectFinesDto;
}

export class ListLateFinesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID('all') runId?: string;
  @IsOptional() @IsUUID('all') studentId?: string;
  @IsOptional() @IsUUID('all') classId?: string;
}
