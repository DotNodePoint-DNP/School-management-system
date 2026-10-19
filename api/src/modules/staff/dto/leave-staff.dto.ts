import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { DATE_SHAPE } from '../../../common/dto/date-range-input.dto.js';

export class LeaveStaffDto {
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'leftOn must be YYYY-MM-DD' })
  leftOn?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'leftOnBs must be YYYY-MM-DD' })
  leftOnBs?: string;
  @Trim() @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}
