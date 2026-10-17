import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import {
  RbacService,
  type PermissionGroup,
  type RoleResponse,
} from './rbac.service.js';

@Controller('rbac')
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  @Get('roles')
  @RequirePermissions('roles:read')
  roles(): Promise<RoleResponse[]> {
    return this.rbac.listRoles();
  }

  @Get('permissions')
  @RequirePermissions('roles:read')
  permissions(): Promise<PermissionGroup[]> {
    return this.rbac.listPermissions();
  }
}
