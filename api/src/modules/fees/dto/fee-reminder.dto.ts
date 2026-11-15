import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ExpectRemindersDto {
  @IsInt() @Min(0) recipients!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) total!: number;
}

/** Choose exactly one of classId, sectionId, studentIds or all. */
export class ReminderRunDto {
  @IsOptional() @IsUUID('all') classId?: string;
  @IsOptional() @IsUUID('all') sectionId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  studentIds?: string[];
  @IsOptional() @IsBoolean() all?: boolean;
  /** Which year's class or section to use. Default: the active academic year. */
  @IsOptional() @IsUUID('all') academicYearId?: string;
  /** Only invoices at least this many days past their due date. Default 1. */
  @IsOptional() @IsInt() @Min(1) @Max(365) minDaysOverdue?: number;
  /** Families owing less than this (in total) are left alone. Default 100. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  minOutstanding?: number;
  /** A family reminded within this many days is skipped. Default 7. */
  @IsOptional() @IsInt() @Min(1) @Max(90) cooldownDays?: number;
  /** The figures from the preview. If they have changed, nothing is sent. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ExpectRemindersDto)
  expect?: ExpectRemindersDto;
}
