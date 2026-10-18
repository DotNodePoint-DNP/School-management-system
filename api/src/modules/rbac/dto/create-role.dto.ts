import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { PERMISSION_CODE } from './set-role-permissions.dto.js';

export const ROLE_NAME = /^[A-Za-z][A-Za-z0-9 _-]{1,49}$/;
const ROLE_NAME_MESSAGE =
  'Role name must be 2-50 characters: letters, numbers, spaces, hyphens or underscores';

export class CreateRoleDto {
  @Trim()
  @IsString()
  @Matches(ROLE_NAME, { message: ROLE_NAME_MESSAGE })
  name!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @Matches(PERMISSION_CODE, {
    each: true,
    message: 'Each permission must look like "module:action"',
  })
  permissions!: string[];
}
