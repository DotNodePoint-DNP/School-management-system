import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import {
  ATTENDANCE_STATUSES,
  type AttendanceStatusValue,
} from '../../../common/constants/attendance.js';

export class AttendanceEntryDto {
  @IsUUID('all') enrollmentId!: string;
  @IsIn(ATTENDANCE_STATUSES) status!: AttendanceStatusValue;
  @IsOptional() @Trim() @IsString() @MaxLength(255) note?: string;
}

export class SubmitAttendanceDto {
  /** Every student on the roster, exactly once. */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => AttendanceEntryDto)
  records!: AttendanceEntryDto[];

  /** Required when the edit window has passed. */
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason?: string;
}
