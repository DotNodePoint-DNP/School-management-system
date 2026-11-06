import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { DATE_SHAPE } from '../../../common/dto/date-range-input.dto.js';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export const ADJUSTMENT_KINDS = ['WAIVER', 'WRITE_OFF', 'CORRECTION'] as const;
export const ADJUSTMENT_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;

export class VoidInvoiceDto {
  @Trim() @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}

export class ReissueInvoiceDto {
  /** Admission invoices only. Default: today. Periodic invoices keep their billing period's due date. */
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'dueDate must be YYYY-MM-DD' })
  dueDate?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'dueDateBs must be YYYY-MM-DD' })
  dueDateBs?: string;
  /** The net amount from the preview. If the figures have changed, nothing is created. */
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) expectNet?: number;
}

export class RequestAdjustmentDto {
  @IsIn(ADJUSTMENT_KINDS) kind!: (typeof ADJUSTMENT_KINDS)[number];
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100_000_000)
  amount!: number;
  @Trim() @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}

export class DecideAdjustmentDto {
  @IsOptional() @Trim() @IsString() @MaxLength(300) note?: string;
}

export class RejectAdjustmentDto {
  @Trim() @IsString() @MinLength(5) @MaxLength(300) note!: string;
}

export class ListAdjustmentsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(ADJUSTMENT_STATUSES)
  status?: (typeof ADJUSTMENT_STATUSES)[number];
  @IsOptional()
  @IsIn(ADJUSTMENT_KINDS)
  kind?: (typeof ADJUSTMENT_KINDS)[number];
  @IsOptional() @IsUUID('all') fiscalYearId?: string;
  @IsOptional() @IsUUID('all') classId?: string;
}
