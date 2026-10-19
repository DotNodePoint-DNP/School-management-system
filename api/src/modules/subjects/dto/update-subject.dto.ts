import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { SUBJECT_CODE, toUpperTrim } from './create-subject.dto.js';

export class UpdateSubjectDto {
  @IsOptional()
  @Transform(toUpperTrim)
  @Matches(SUBJECT_CODE, {
    message:
      'Code must be 2-20 characters: letters, numbers, hyphen or underscore',
  })
  code?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
