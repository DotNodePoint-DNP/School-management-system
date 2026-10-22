import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import {
  RELATIONSHIPS,
  type Relationship,
} from '../../../common/constants/people.js';

/** Either an existing guardian (`guardianId`) or the details of a new one. */
export class GuardianInputDto {
  @IsOptional() @IsUUID('all') guardianId?: string;
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(60) middleName?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(60) lastName?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(150) fullNameNp?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @Trim() @IsEmail() @MaxLength(254) email?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(80) occupation?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(255) address?: string;
  @IsIn(RELATIONSHIPS) relationship!: Relationship;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsBoolean() isEmergencyContact?: boolean;
  /** Default true: a login is created and credentials are sent. */
  @IsOptional() @IsBoolean() createLogin?: boolean;
  /** The clerk confirmed the phone number with the guardian. Required when createLogin applies to a new phone. */
  @IsOptional() @IsBoolean() phoneConfirmed?: boolean;
}
