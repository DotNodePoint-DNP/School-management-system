import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { StaffAttendanceService } from './staff-attendance.service.js';
import {
  StaffPolicyDto,
  PunchDto,
  StaffRequestDto,
  ReviewDto,
} from './staff-attendance.dto.js';
import { todayIso } from '../../common/utils/bs-date.js';

@Controller('staff-attendance')
export class StaffAttendanceController {
  constructor(private readonly service: StaffAttendanceService) {}

  @Get('policy')
  @RequirePermissions('school:manage')
  policy() {
    return this.service.policy();
  }

  @Put('policy')
  @RequirePermissions('school:manage')
  save(@Body() dto: StaffPolicyDto, @CurrentUser() actor: AuthUser) {
    return this.service.savePolicy(dto, actor);
  }

  @Get('me')
  @RequirePermissions('staff-attendance:self')
  mine(@CurrentUser() actor: AuthUser) {
    return this.service.mine(actor);
  }

  @Post('me/punches')
  @RequirePermissions('staff-attendance:self')
  punch(@Body() dto: PunchDto, @CurrentUser() actor: AuthUser) {
    return this.service.punch(dto, actor);
  }

  @Post('me/requests')
  @RequirePermissions('staff-attendance:self')
  request(@Body() dto: StaffRequestDto, @CurrentUser() actor: AuthUser) {
    return this.service.request(dto, actor);
  }

  @Get('requests')
  @RequirePermissions('staff-attendance:review')
  queue() {
    return this.service.queue();
  }

  @Post('requests/:id/decision')
  @RequirePermissions('staff-attendance:review')
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.review(id, dto, actor);
  }

  @Get('register')
  @RequirePermissions('staff-attendance:review')
  register(@Query('date') date?: string) {
    return this.service.register(date ?? todayIso());
  }
}
