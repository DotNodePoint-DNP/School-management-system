import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';

export const SUBJECT_CODE = /^[A-Z0-9][A-Z0-9_-]{1,19}$/;
export const toUpperTrim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateSubjectDto {
  @Transform(toUpperTrim)
  @Matches(SUBJECT_CODE, {
    message:
      'Code must be 2-20 characters: letters, numbers, hyphen or underscore',
  })
  code!: string;

  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}
