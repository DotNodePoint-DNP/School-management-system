import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
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

  @Get('roles/:id')
  @RequirePermissions('roles:read')
  role(@Param('id', ParseUUIDPipe) id: string): Promise<RoleResponse> {
    return this.rbac.getRole(id);
  }

  @Get('permissions')
  @RequirePermissions('roles:read')
  permissions(): Promise<PermissionGroup[]> {
    return this.rbac.listPermissions();
  }

  @Post('roles')
  @RequirePermissions('roles:manage')
  create(
    @Body() dto: CreateRoleDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<RoleResponse> {
    return this.rbac.createRole(dto, actor);
  }

  @Patch('roles/:id')
  @RequirePermissions('roles:manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<RoleResponse> {
    return this.rbac.updateRole(id, dto, actor);
  }

  @Put('roles/:id/permissions')
  @RequirePermissions('roles:manage')
  setPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRolePermissionsDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<RoleResponse> {
    return this.rbac.setPermissions(id, dto, actor);
  }

  @Delete('roles/:id')
  @HttpCode(200)
  @RequirePermissions('roles:manage')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ deleted: true }> {
    await this.rbac.deleteRole(id, actor);
    return { deleted: true };
  }
}
