import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { GENDERS, type GenderValue } from '../../../common/constants/people.js';
import { DATE_SHAPE } from '../../../common/dto/date-range-input.dto.js';
import { GuardianInputDto } from './guardian-input.dto.js';
import { PlacementDto } from './enrollment.dto.js';

export class CreateStudentDto {
  @Trim() @IsString() @MinLength(1) @MaxLength(60) firstName!: string;
  @IsOptional() @Trim() @IsString() @MaxLength(60) middleName?: string;
  @Trim() @IsString() @MinLength(1) @MaxLength(60) lastName!: string;
  @IsOptional() @Trim() @IsString() @MaxLength(150) fullNameNp?: string;
  @IsIn(GENDERS) gender!: GenderValue;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'dateOfBirth must be YYYY-MM-DD' })
  dateOfBirth?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'dateOfBirthBs must be YYYY-MM-DD' })
  dateOfBirthBs?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'admissionDate must be YYYY-MM-DD' })
  admissionDate?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'admissionDateBs must be YYYY-MM-DD' })
  admissionDateBs?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(255) address?: string;
  /** Only for migrating existing registers; needs students:set-admission-no. Normally left blank. */
  @IsOptional()
  @Trim()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9/_-]{0,29}$/, {
    message: 'admissionNo has invalid characters',
  })
  admissionNo?: string;
  @IsOptional() @IsBoolean() confirmNotDuplicate?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => GuardianInputDto)
  guardians!: GuardianInputDto[];
  /** Optional initial class placement; the admission and the seat succeed or fail together. */
  @IsOptional()
  @ValidateNested()
  @Type(() => PlacementDto)
  placement?: PlacementDto;
}
