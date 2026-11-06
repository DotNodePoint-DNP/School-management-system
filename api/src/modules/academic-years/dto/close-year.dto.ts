import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';

export class CloseYearDto {
  /** Needed when students are still enrolled (not moved on by a promotion plan). Requires the promotion:apply permission. */
  @IsOptional() @IsBoolean() acknowledgeUnplaced?: boolean;
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason?: string;
}
