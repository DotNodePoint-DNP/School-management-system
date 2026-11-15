import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
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
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js';

export class DayQueryDto {
  /** Default: today. */
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'date must be YYYY-MM-DD' })
  date?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'dateBs must be YYYY-MM-DD' })
  dateBs?: string;
}

export class CloseLineDto {
  @IsUUID('all') cashierId!: string;
  /** The cash actually counted for this cashier. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  countedCash!: number;
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  note?: string;
}

export class ExpectDayDto {
  /** The figures you were shown. If they changed meanwhile, the close is refused. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-100_000_000)
  @Max(100_000_000)
  expectedCash!: number;
  @IsInt() @Min(0) receiptCount!: number;
}

export class CloseDayDto extends DayQueryDto {
  /** One line for every cashier who took cash that day. */
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CloseLineDto)
  lines!: CloseLineDto[];
  @ValidateNested() @Type(() => ExpectDayDto) expect!: ExpectDayDto;
  /** Required when the day's counted cash differs from the expected cash. */
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  note?: string;
}

export class ReopenDayDto {
  @Trim() @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}

export class ListDayClosesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'from must be YYYY-MM-DD' })
  from?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
  @IsOptional() @IsIn(['ACTIVE', 'REOPENED']) status?: 'ACTIVE' | 'REOPENED';
}

export class PendingDaysQueryDto {
  /** Default: 60 days ago. */
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'from must be YYYY-MM-DD' })
  from?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'to must be YYYY-MM-DD' })
  to?: string;
}
