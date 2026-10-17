import { ArrayMaxSize, ArrayUnique, IsArray, Matches } from 'class-validator';

export const PERMISSION_CODE = /^[a-z][a-z-]*:[a-z][a-z-]*$/;

export class SetRolePermissionsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique()
  @Matches(PERMISSION_CODE, {
    each: true,
    message: 'Each permission must look like "module:action"',
  })
  permissions!: string[];
}
