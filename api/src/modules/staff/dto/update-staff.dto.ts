import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import {
  GENDERS,
  STAFF_KINDS,
  type GenderValue,
  type StaffKindValue,
} from '../../../common/constants/people.js';
import { DATE_SHAPE } from '../../../common/dto/date-range-input.dto.js';

export class UpdateStaffDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(60) middleName?: string;
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  lastName?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(150) fullNameNp?: string;
  @IsOptional() @IsIn(GENDERS) gender?: GenderValue;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'dateOfBirth must be YYYY-MM-DD' })
  dateOfBirth?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'dateOfBirthBs must be YYYY-MM-DD' })
  dateOfBirthBs?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'joinDate must be YYYY-MM-DD' })
  joinDate?: string;
  @IsOptional()
  @Matches(DATE_SHAPE, { message: 'joinDateBs must be YYYY-MM-DD' })
  joinDateBs?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @Trim() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(255) address?: string;
  @IsOptional() @IsIn(STAFF_KINDS) kind?: StaffKindValue;
  @IsOptional() @Trim() @IsString() @MaxLength(80) designation?: string;
}
