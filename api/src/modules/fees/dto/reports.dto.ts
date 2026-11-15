import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';
import { DATE_SHAPE } from '../../../common/dto/date-range-input.dto.js';
import { PAYMENT_METHODS, type PaymentMethodValue } from './payment.dto.js';

export class CollectionsQueryDto {
  /** Default: today. Dates are the receipt (paid-on) dates. */
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'from must be YYYY-MM-DD' })
  from?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
  @IsOptional() @IsUUID('all') cashierId?: string;
  @IsOptional() @IsIn(PAYMENT_METHODS) method?: PaymentMethodValue;
  @IsOptional() @IsUUID('all') fiscalYearId?: string;
}
