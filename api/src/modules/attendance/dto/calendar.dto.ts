import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { DateRangeInputDto } from '../../../common/dto/date-range-input.dto.js';

export class UpdateCalendarSettingsDto {
  /** 0 = Sunday ... 6 = Saturday. An empty list means every day is a school day. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weeklyOffDays?: number[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  attendanceEditWindowDays?: number;
}

/** A holiday or make-up working day. Give a start date, and an end date for a range (up to 31 days). */
export class CreateCalendarEntryDto extends DateRangeInputDto {
  @IsIn(['HOLIDAY', 'WORKING_DAY']) kind!: 'HOLIDAY' | 'WORKING_DAY';
  @Trim() @IsString() @MinLength(1) @MaxLength(100) name!: string;
}
