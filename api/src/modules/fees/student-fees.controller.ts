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
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import {
  CreateDiscountDto,
  DecisionReasonDto,
  ListDiscountsQueryDto,
  UpdateDiscountDto,
} from './dto/discount.dto.js';
import {
  CreateFeeAssignmentDto,
  UpdateFeeAssignmentDto,
} from './dto/fee-assignment.dto.js';
import { DiscountsService } from './discounts.service.js';
import { FeeAssignmentsService } from './fee-assignments.service.js';
import { FeeProfileService } from './fee-profile.service.js';

@Controller()
export class StudentFeesController {
  constructor(
    private readonly profile: FeeProfileService,
    private readonly assignments: FeeAssignmentsService,
    private readonly discounts: DiscountsService,
  ) {}

  @Get('enrollments/:id/fee-profile')
  @RequirePermissions('fees:read')
  feeProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.profile.get(id, actor);
  }

  @Get('enrollments/:id/fee-assignments')
  @RequirePermissions('fees:read')
  listAssignments(@Param('id', ParseUUIDPipe) id: string) {
    return this.assignments.list(id);
  }

  @Post('enrollments/:id/fee-assignments')
  @RequirePermissions('fees:assign')
  createAssignment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateFeeAssignmentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.assignments.create(id, dto, actor);
  }

  @Patch('enrollments/:id/fee-assignments/:assignmentId')
  @RequirePermissions('fees:assign')
  updateAssignment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @Body() dto: UpdateFeeAssignmentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.assignments.update(id, assignmentId, dto, actor);
  }

  @Delete('enrollments/:id/fee-assignments/:assignmentId')
  @HttpCode(200)
  @RequirePermissions('fees:assign')
  async removeAssignment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
    @CurrentUser() actor: AuthUser,
  ) {
    await this.assignments.remove(id, assignmentId, actor);
    return { deleted: true };
  }

  @Get('enrollments/:id/discounts')
  @RequirePermissions('fees:read')
  enrollmentDiscounts(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.discounts.forEnrollment(id, actor);
  }

  @Post('enrollments/:id/discounts')
  @RequirePermissions('fees:discount-create')
  createDiscount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDiscountDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.discounts.create(id, dto, actor);
  }

  @Get('discounts')
  @RequirePermissions('fees:read')
  listDiscounts(
    @Query() query: ListDiscountsQueryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.discounts.list(query, actor);
  }

  @Patch('discounts/:id')
  @RequirePermissions('fees:discount-create')
  updateDiscount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDiscountDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.discounts.update(id, dto, actor);
  }

  @Delete('discounts/:id')
  @HttpCode(200)
  @RequirePermissions('fees:discount-create')
  async removeDiscount(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    await this.discounts.remove(id, actor);
    return { deleted: true };
  }

  @Post('discounts/:id/approve')
  @HttpCode(200)
  @RequirePermissions('fees:discount-approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.discounts.approve(id, actor);
  }

  @Post('discounts/:id/reject')
  @HttpCode(200)
  @RequirePermissions('fees:discount-approve')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecisionReasonDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.discounts.reject(id, dto, actor);
  }

  @Post('discounts/:id/revoke')
  @HttpCode(200)
  @RequirePermissions('fees:discount-approve')
  revoke(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecisionReasonDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.discounts.revoke(id, dto, actor);
  }
}
