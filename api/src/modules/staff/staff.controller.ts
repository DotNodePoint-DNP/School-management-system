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
  Query,
} from '@nestjs/common';
import type { Paginated } from '../../common/dto/pagination.dto.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { CreateStaffLoginDto } from './dto/create-staff-login.dto.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { LeaveStaffDto } from './dto/leave-staff.dto.js';
import { ListStaffQueryDto } from './dto/list-staff-query.dto.js';
import { UpdateStaffDto } from './dto/update-staff.dto.js';
import {
  StaffService,
  type StaffListItem,
  type StaffResponse,
} from './staff.service.js';

@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @RequirePermissions('staff:read')
  list(@Query() query: ListStaffQueryDto): Promise<Paginated<StaffListItem>> {
    return this.staff.list(query);
  }

  @Post()
  @RequirePermissions('staff:manage')
  create(
    @Body() dto: CreateStaffDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<StaffResponse> {
    return this.staff.create(dto, actor);
  }

  @Get(':id')
  @RequirePermissions('staff:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<StaffResponse> {
    return this.staff.get(id);
  }

  @Patch(':id')
  @RequirePermissions('staff:manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<StaffResponse> {
    return this.staff.update(id, dto, actor);
  }

  @Post(':id/leave')
  @HttpCode(200)
  @RequirePermissions('staff:manage')
  leave(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LeaveStaffDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<StaffResponse> {
    return this.staff.leave(id, dto, actor);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @RequirePermissions('staff:manage')
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<StaffResponse> {
    return this.staff.reactivate(id, actor);
  }

  @Post(':id/create-login')
  @RequirePermissions('staff:create-login')
  createLogin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateStaffLoginDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ staff: StaffResponse; temporaryPassword: string }> {
    return this.staff.createLogin(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermissions('staff:manage')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ deleted: true }> {
    await this.staff.remove(id, actor);
    return { deleted: true };
  }
}
