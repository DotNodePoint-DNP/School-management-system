import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { DATE_SHAPE } from '../../../common/dto/date-range-input.dto.js';
import {
  AllocationDto,
  PAYMENT_METHODS,
  type PaymentMethodValue,
} from './payment.dto.js';

export class ReversePaymentDto {
  @Trim() @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}

export class ApplyCreditDto {
  /** The student who holds the advance credit. */
  @IsUUID('all') studentId!: string;
  /** Exactly one of allocations or autoAllocate. The invoices may belong to this student or a sibling. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations?: AllocationDto[];
  /** Pay this student's own open invoices, oldest due date first, as far as the credit goes. */
  @IsOptional() @IsBoolean() autoAllocate?: boolean;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000_000)
  maxAmount?: number;
}

export class RefundCreditDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000_000)
  amount!: number;
  @IsIn(PAYMENT_METHODS) method!: PaymentMethodValue;
  /** Cheque number or transaction id. Required for every method except cash. */
  @IsOptional()
  @Trim()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9 \-_/.]{1,58}[A-Za-z0-9]$/, {
    message: 'reference must be 3-60 letters, digits, spaces or - _ / .',
  })
  reference?: string;
  @Trim() @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}

export class StatementQueryDto {
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'from must be YYYY-MM-DD' })
  from?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
  /** Only the invoices of one academic year. */
  @IsOptional() @IsUUID('all') academicYearId?: string;
}
