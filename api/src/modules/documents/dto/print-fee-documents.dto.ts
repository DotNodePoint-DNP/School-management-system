import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { DATE_SHAPE } from '../../../common/dto/date-range-input.dto.js';

const SLOT = /^(PRINCIPAL|EXAM_CONTROLLER|ACCOUNTANT|OTHER:.{2,60})$/;
const SLOT_MESSAGE =
  'Each slot must be PRINCIPAL, EXAM_CONTROLLER, ACCOUNTANT or OTHER:<label>';

class SigningOptions {
  /** "line" prints a blank signature line for everyone, to sign by hand. */
  @IsOptional() @IsIn(['auto', 'line']) signatures?: 'auto' | 'line';
  /** Whose signature to show. Default: the accountant. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @Matches(SLOT, { each: true, message: SLOT_MESSAGE })
  slots?: string[];
}

export class PrintReceiptsDto extends SigningOptions {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  paymentIds!: string[];
}

export class PrintInvoicesDto extends SigningOptions {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  invoiceIds!: string[];
}

export class PrintStatementsDto extends SigningOptions {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  studentIds!: string[];
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'from must be YYYY-MM-DD' })
  from?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
  @IsOptional() @IsUUID('all') academicYearId?: string;
}

/** Choose exactly one of classId, sectionId, studentIds or all. */
export class PrintFeeVouchersDto extends SigningOptions {
  @IsOptional() @IsUUID('all') classId?: string;
  @IsOptional() @IsUUID('all') sectionId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  studentIds?: string[];
  @IsOptional() @IsBoolean() all?: boolean;
  /** Which year's class or section to use. Default: the active academic year. */
  @IsOptional() @IsUUID('all') academicYearId?: string;
  /** Leave out students who owe less than this. Default: any amount. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  minOutstanding?: number;
  /** List only the invoices that are past their due date. */
  @IsOptional() @IsBoolean() onlyOverdue?: boolean;
  @IsOptional() @IsIn(['ROLL', 'AMOUNT']) order?: 'ROLL' | 'AMOUNT';
}
