import { IsOptional, IsUUID, Matches } from 'class-validator';
import { DATE_SHAPE } from '../../../common/dto/date-range-input.dto.js';

export class PortalAttendanceQueryDto {
  @IsOptional() @IsUUID('all') enrollmentId?: string;
  /** Default: the 30 days up to today (or the end of that academic year). */
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'from must be YYYY-MM-DD' })
  from?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}

export class PortalReportCardQueryDto {
  @IsOptional() @IsUUID('all') enrollmentId?: string;
  /** Leave out for the combined (final) result. */
  @IsOptional() @IsUUID('all') examId?: string;
}
