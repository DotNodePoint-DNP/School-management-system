import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { DATE_SHAPE } from '../../../common/dto/date-range-input.dto.js';

export class ReportRangeQueryDto {
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'from must be YYYY-MM-DD' })
  from?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'fromBs must be YYYY-MM-DD' })
  fromBs?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'toBs must be YYYY-MM-DD' })
  toBs?: string;
}

export class StudentHistoryQueryDto extends ReportRangeQueryDto {
  /** The `nextCursor` of the previous page (a date, YYYY-MM-DD). */
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'cursor must be YYYY-MM-DD' })
  cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number =
    50;
}

export class PendingQueryDto {
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'date must be YYYY-MM-DD' })
  date?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'dateBs must be YYYY-MM-DD' })
  dateBs?: string;
}

export class ChangesQueryDto {
  @IsOptional() @IsUUID('all') studentId?: string;
  @IsOptional() @IsUUID('all') sectionId?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'date must be YYYY-MM-DD' })
  date?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'dateBs must be YYYY-MM-DD' })
  dateBs?: string;
  @IsOptional() @IsUUID('all') cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit: number =
    50;
}
