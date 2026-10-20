import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';

export class UpdateGuardianDto {
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
}
