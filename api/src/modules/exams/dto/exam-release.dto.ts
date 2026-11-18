import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { DATE_SHAPE } from '../../../common/dto/date-range-input.dto.js';

/** Give a release date (AD, or BS with releaseOnBs), or clear: true to withdraw the release. */
export class SetExamReleaseDto {
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'releaseOn must be YYYY-MM-DD' })
  releaseOn?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'releaseOnBs must be YYYY-MM-DD' })
  releaseOnBs?: string;
  @IsOptional() @IsBoolean() clear?: boolean;
  /** Needed to withdraw or postpone a release that parents can already see. */
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(10)
  @MaxLength(300)
  reason?: string;
}
