import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import { DATE_SHAPE } from '../../../common/dto/date-range-input.dto.js';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export class PortalInvoicesQueryDto extends PaginationQueryDto {
  /** OPEN: still owing something. CLOSED: nothing owed. */
  @IsOptional() @IsIn(['OPEN', 'CLOSED']) status?: 'OPEN' | 'CLOSED';
}

export class PortalPaymentsQueryDto extends PaginationQueryDto {}

export class PortalStatementQueryDto {
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'from must be YYYY-MM-DD' })
  from?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}

export class PortalPrintReportCardDto {
  @IsUUID('all') studentId!: string;
  @IsOptional() @IsUUID('all') enrollmentId?: string;
  /** Leave out for the combined (final) result. */
  @IsOptional() @IsUUID('all') examId?: string;
}
export class PortalPrintReceiptDto {
  @IsUUID('all') paymentId!: string;
}
export class PortalPrintInvoiceDto {
  @IsUUID('all') invoiceId!: string;
}
export class PortalPrintStatementDto {
  @IsUUID('all') studentId!: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'from must be YYYY-MM-DD' })
  from?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}
