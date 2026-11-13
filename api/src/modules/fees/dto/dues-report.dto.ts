import { Transform, Type } from 'class-transformer';
import {
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
} from 'class-validator';
import { DATE_SHAPE } from '../../../common/dto/date-range-input.dto.js';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export class DuesSummaryQueryDto {
  @IsOptional() @IsUUID('all') classId?: string;
  @IsOptional() @IsUUID('all') sectionId?: string;
  @IsOptional() @IsUUID('all') academicYearId?: string;
}

export class DuesStudentsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID('all') classId?: string;
  @IsOptional() @IsUUID('all') sectionId?: string;
  @IsOptional() @IsUUID('all') academicYearId?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  minOutstanding?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000)
  minDaysOverdue?: number;
  /** Part of a name or an admission number. */
  @IsOptional() @IsString() @MaxLength(60) search?: string;
  @IsOptional() @IsIn(['OUTSTANDING', 'OLDEST', 'NAME']) sort?:
    'OUTSTANDING' | 'OLDEST' | 'NAME';
}

export class BillingQueryDto {
  /** Invoices issued on or after this date. */
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'from must be YYYY-MM-DD' })
  from?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
  @IsOptional() @IsUUID('all') fiscalYearId?: string;
  @IsOptional() @IsUUID('all') academicYearId?: string;
  @IsOptional() @IsUUID('all') periodId?: string;
  @IsOptional() @IsUUID('all') classId?: string;
  @IsOptional() @IsIn(['PERIODIC', 'ADMISSION', 'AD_HOC']) kind?:
    'PERIODIC' | 'ADMISSION' | 'AD_HOC';
}
