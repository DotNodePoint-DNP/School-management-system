import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
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
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { DATE_SHAPE } from '../../../common/dto/date-range-input.dto.js';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export const PAYMENT_METHODS = [
  'CASH',
  'BANK_TRANSFER',
  'CHEQUE',
  'ESEWA',
  'KHALTI',
  'FONEPAY_QR',
] as const;
export type PaymentMethodValue = (typeof PAYMENT_METHODS)[number];

export class AllocationDto {
  @IsUUID('all') invoiceId!: string;
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000_000)
  amount!: number;
}

export class AutoAllocateDto {
  /** The students being paid for (for example siblings). Their open invoices are paid oldest due date first. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  studentIds!: string[];
}

export class KeepCreditDto {
  /** The student who will hold the advance credit. */
  @IsUUID('all') studentId!: string;
}

export class RecordPaymentDto {
  /** A new random UUID for each payment form. Sending the same one again returns the receipt already created. */
  @IsUUID('all') idempotencyKey!: string;
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
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'paidOn must be YYYY-MM-DD' })
  paidOn?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'paidOnBs must be YYYY-MM-DD' })
  paidOnBs?: string;
  @IsOptional() @IsUUID('all') payerGuardianId?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(100) payerName?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(300) note?: string;
  /** Exactly one of allocations or autoAllocate. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations?: AllocationDto[];
  @IsOptional()
  @ValidateNested()
  @Type(() => AutoAllocateDto)
  autoAllocate?: AutoAllocateDto;
  /** Without this, any amount beyond what is owed is refused. */
  @IsOptional()
  @ValidateNested()
  @Type(() => KeepCreditDto)
  keepExcessAsCredit?: KeepCreditDto;
}

const toBool = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

export class ListPaymentsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID('all') fiscalYearId?: string;
  @IsOptional() @IsIn(PAYMENT_METHODS) method?: PaymentMethodValue;
  @IsOptional() @IsUUID('all') receivedById?: string;
  @IsOptional() @IsUUID('all') studentId?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'from must be YYYY-MM-DD' })
  from?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
  /** Part of a receipt number or a reference. */
  @IsOptional() @IsString() @MaxLength(40) search?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() reversed?: boolean;
}

export class DuesQueryDto {
  /** Comma-separated student ids (at most 10), for example a family. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  studentIds!: string[];
}
