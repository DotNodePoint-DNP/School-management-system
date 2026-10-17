import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';

export class UpdateUserDto {
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @Trim()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
