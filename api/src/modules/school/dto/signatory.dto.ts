import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { DATE_SHAPE } from '../../../common/dto/date-range-input.dto.js';

/** Latin letters, digits, Devanagari and a little punctuation, so the lower-cased label is the same in the app and the database. */
export const ROLE_LABEL = /^[A-Za-z0-9\u0900-\u097F .,&()'/-]{2,60}$/;
const ROLE_LABEL_MESSAGE =
  "roleLabel must be 2-60 characters: letters, digits, Devanagari, spaces and . , & ( ) ' / -";

export class CreateSignatoryDto {
  @IsIn(['PRINCIPAL', 'EXAM_CONTROLLER', 'ACCOUNTANT', 'OTHER']) role!:
    'PRINCIPAL' | 'EXAM_CONTROLLER' | 'ACCOUNTANT' | 'OTHER';
  /** Required for OTHER (for example "Management Committee Chair"), not allowed otherwise. */
  @IsOptional()
  @Trim()
  @Matches(ROLE_LABEL, { message: ROLE_LABEL_MESSAGE })
  roleLabel?: string;
  /** Optional when staffId is given: the staff member's name is used. */
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullNameEn?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(120) fullNameNp?: string;
  /** Optional when staffId is given and that staff record has a designation. */
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  designationEn?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(80) designationNp?: string;
  @IsOptional() @IsUUID('all') staffId?: string;

  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'validFrom must be YYYY-MM-DD' })
  validFrom?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'validFromBs must be YYYY-MM-DD' })
  validFromBs?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'validTo must be YYYY-MM-DD' })
  validTo?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'validToBs must be YYYY-MM-DD' })
  validToBs?: string;
  /** Default true: the previous open-ended holder of the role ends the day before validFrom. */
  @IsOptional() @IsBoolean() closePrevious?: boolean;
}

/** The role itself cannot change; create a new record for a different role. null clears an optional field. */
export class UpdateSignatoryDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  fullNameEn?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(120) fullNameNp?: string | null;
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  designationEn?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(80) designationNp?:
    string | null;
  @IsOptional() @IsUUID('all') staffId?: string | null;
  @IsOptional() @IsIn(['DIGITAL', 'LINE']) mode?: 'DIGITAL' | 'LINE';
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'validFrom must be YYYY-MM-DD' })
  validFrom?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'validFromBs must be YYYY-MM-DD' })
  validFromBs?: string;
  /** null makes the holder open-ended again. */
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'validTo must be YYYY-MM-DD' })
  validTo?: string | null;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'validToBs must be YYYY-MM-DD' })
  validToBs?: string;
}

export class SetSignatureModeDto {
  @IsIn(['DIGITAL', 'LINE']) mode!: 'DIGITAL' | 'LINE';
}
