import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import {
  ATTENDANCE_STATUSES,
  type AttendanceStatusValue,
} from '../../../common/constants/attendance.js';

export class ChangeAttendanceDto {
  @IsOptional() @IsIn(ATTENDANCE_STATUSES) status?: AttendanceStatusValue;
  /** An empty string clears the note. */
  @IsOptional() @Trim() @IsString() @MaxLength(255) note?: string;
  /** Required when the edit window has passed. */
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason?: string;
}
