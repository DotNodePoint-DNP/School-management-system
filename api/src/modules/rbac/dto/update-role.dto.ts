import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Trim } from '../../../common/decorators/trim.decorator.js';
import { ROLE_NAME } from './create-role.dto.js';

export class UpdateRoleDto {
  @IsOptional()
  @Trim()
  @IsString()
  @Matches(ROLE_NAME, {
    message:
      'Role name must be 2-50 characters: letters, numbers, spaces, hyphens or underscores',
  })
  name?: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(255)
  description?: string;
}
