import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { DATE_SHAPE } from '../../../common/dto/date-range-input.dto.js';

export class ChangeStudentStatusDto {
  @IsIn(['WITHDRAWN', 'TRANSFERRED', 'GRADUATED']) status!:
    'WITHDRAWN' | 'TRANSFERRED' | 'GRADUATED';
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'effectiveOn must be YYYY-MM-DD' })
  effectiveOn?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'effectiveOnBs must be YYYY-MM-DD' })
  effectiveOnBs?: string;
  @Trim() @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}
