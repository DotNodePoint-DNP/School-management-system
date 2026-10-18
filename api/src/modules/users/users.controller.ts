import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { Paginated } from '../../common/dto/pagination.dto.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { ListUsersQueryDto } from './dto/query-user.dto.js';
import { SetUserRolesDto } from './dto/set-user-roles.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import type { UserResponse } from './dto/user-response.dto.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('users:read')
  list(@Query() query: ListUsersQueryDto): Promise<Paginated<UserResponse>> {
    return this.users.list(query);
  }

  @Get(':id')
  @RequirePermissions('users:read')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponse> {
    return this.users.findOne(id);
  }

  @Post()
  @RequirePermissions('users:create')
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ user: UserResponse; temporaryPassword: string }> {
    return this.users.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('users:update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<UserResponse> {
    return this.users.update(id, dto, actor);
  }

  @Put(':id/roles')
  @RequirePermissions('users:assign-roles')
  setRoles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetUserRolesDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<UserResponse> {
    return this.users.setRoles(id, dto, actor);
  }

  @Post(':id/deactivate')
  @HttpCode(200)
  @RequirePermissions('users:deactivate')
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<UserResponse> {
    return this.users.deactivate(id, actor);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @RequirePermissions('users:deactivate')
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<UserResponse> {
    return this.users.activate(id, actor);
  }

  @Post(':id/reset-password')
  @HttpCode(200)
  @RequirePermissions('users:reset-password')
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ temporaryPassword: string }> {
    return this.users.resetPassword(id, actor);
  }
}
