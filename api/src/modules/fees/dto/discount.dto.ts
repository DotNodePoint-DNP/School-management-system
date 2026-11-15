import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export const DISCOUNT_CATEGORIES = [
  'MERIT_SCHOLARSHIP',
  'NEED_SCHOLARSHIP',
  'SIBLING',
  'STAFF_CHILD',
  'MANAGEMENT',
  'OTHER',
] as const;
export const DISCOUNT_TYPES = [
  'PERCENT',
  'FIXED_OFF',
  'PRICE_OVERRIDE',
] as const;
export const DISCOUNT_STATUSES = [
  'PENDING',
  'APPROVED',
  'REJECTED',
  'REVOKED',
] as const;
export type DiscountCategoryValue = (typeof DISCOUNT_CATEGORIES)[number];
export type DiscountTypeValue = (typeof DISCOUNT_TYPES)[number];

export class CreateDiscountDto {
  @IsIn(DISCOUNT_CATEGORIES) category!: DiscountCategoryValue;
  /** Leave out for a discount on the whole invoice. Required for PRICE_OVERRIDE. */
  @IsOptional() @IsUUID('all') feeHeadId?: string;
  @IsIn(DISCOUNT_TYPES) type!: DiscountTypeValue;
  /** PERCENT: 0.01-100. FIXED_OFF: rupees off. PRICE_OVERRIDE: the price to charge instead (0 allowed). */
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(10_000_000) value!: number;
  /** Both left out: the whole academic year. Otherwise a range of billing periods. */
  @IsOptional() @IsUUID('all') fromPeriodId?: string;
  @IsOptional() @IsUUID('all') toPeriodId?: string;
  @Trim() @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}

export class UpdateDiscountDto {
  @IsOptional() @IsIn(DISCOUNT_CATEGORIES) category?: DiscountCategoryValue;
  @IsOptional() @IsUUID('all') feeHeadId?: string | null;
  @IsOptional() @IsIn(DISCOUNT_TYPES) type?: DiscountTypeValue;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  value?: number;
  @IsOptional() @IsUUID('all') fromPeriodId?: string | null;
  @IsOptional() @IsUUID('all') toPeriodId?: string | null;
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason?: string;
}

export class DecisionReasonDto {
  @Trim() @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}

export class ListDiscountsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(DISCOUNT_STATUSES)
  status?: (typeof DISCOUNT_STATUSES)[number];
  @IsOptional() @IsIn(DISCOUNT_CATEGORIES) category?: DiscountCategoryValue;
  @IsOptional() @IsUUID('all') classId?: string;
  @IsOptional() @IsUUID('all') academicYearId?: string;
}
