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
import {
  AssignRollNumbersDto,
  MoveEnrollmentDto,
  PlacementDto,
  SetRollNumberDto,
} from './dto/enrollment.dto.js';
import {
  EnrollmentsService,
  type EnrollmentResponse,
  type OccupancyItem,
  type RollListItem,
} from './enrollments.service.js';

@Controller()
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Post('students/:id/enrollments')
  @RequirePermissions('enrollments:manage')
  enroll(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PlacementDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<EnrollmentResponse> {
    return this.enrollments.enroll(id, dto, actor);
  }

  @Patch('enrollments/:id/section')
  @RequirePermissions('enrollments:manage')
  move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveEnrollmentDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<EnrollmentResponse> {
    return this.enrollments.move(id, dto, actor);
  }

  @Patch('enrollments/:id/roll-number')
  @RequirePermissions('enrollments:manage')
  setRollNumber(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetRollNumberDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<EnrollmentResponse> {
    return this.enrollments.setRollNumber(id, dto.rollNo, actor);
  }

  @Delete('enrollments/:id')
  @HttpCode(200)
  @RequirePermissions('enrollments:manage')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ deleted: true }> {
    await this.enrollments.remove(id, actor);
    return { deleted: true };
  }

  // No @RequirePermissions: admin roles see every section, teachers only their own. The service decides.
  @Get('academic-years/:yearId/sections/:sectionId/enrollments')
  listSection(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<RollListItem[]> {
    return this.enrollments.listSection(yearId, sectionId, actor);
  }

  @Put('academic-years/:yearId/sections/:sectionId/roll-numbers')
  @RequirePermissions('enrollments:manage')
  assignRollNumbers(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() dto: AssignRollNumbersDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<RollListItem[]> {
    return this.enrollments.assignRollNumbers(yearId, sectionId, dto, actor);
  }

  @Get('academic-years/:yearId/occupancy')
  @RequirePermissions('enrollments:read')
  occupancy(
    @Param('yearId', ParseUUIDPipe) yearId: string,
  ): Promise<OccupancyItem[]> {
    return this.enrollments.occupancy(yearId);
  }
}
