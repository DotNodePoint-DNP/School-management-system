import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import {
  DATE_SHAPE,
  DateRangeInputDto,
} from '../../../common/dto/date-range-input.dto.js';

export class GeneratePeriodsDto {
  /** How many months the school bills in this academic year. */
  @IsIn([10, 11, 12]) months!: 10 | 11 | 12;
  /** Day of each BS month on which the fee falls due (1-28, so it exists in every month). Default 10. */
  @IsOptional() @IsInt() @Min(1) @Max(28) dueDay?: number;
  /** BS months not billed (1 = Baisakh ... 12 = Chaitra), for example a vacation month. They are skipped, not counted. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(12, { each: true })
  skipBsMonths?: number[];
}

/** A single period entered by hand: startDate/endDate (AD) or startDateBs/endDateBs, and dueDate or dueDateBs. */
export class CreatePeriodDto extends DateRangeInputDto {
  @Trim() @IsString() @MinLength(2) @MaxLength(60) name!: string;
  @IsOptional() @Trim() @IsString() @MaxLength(60) nameNp?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'dueDate must be YYYY-MM-DD' })
  dueDate?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'dueDateBs must be YYYY-MM-DD' })
  dueDateBs?: string;
}

export class UpdatePeriodDto extends DateRangeInputDto {
  @IsOptional() @Trim() @IsString() @MinLength(2) @MaxLength(60) name?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(60) nameNp?: string | null;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'dueDate must be YYYY-MM-DD' })
  dueDate?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'dueDateBs must be YYYY-MM-DD' })
  dueDateBs?: string;
}
