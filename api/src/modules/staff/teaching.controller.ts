import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { SetTeacherDto } from './dto/set-teacher.dto.js';
import {
  TeachingService,
  type AssignmentsResponse,
  type SectionTeachingResponse,
} from './teaching.service.js';

class YearQueryDto {
  @IsOptional()
  @IsUUID('all')
  academicYearId?: string;
}

@Controller()
export class TeachingController {
  constructor(private readonly teaching: TeachingService) {}

  // No permission needed: it only ever returns the caller's own data.
  @Get('staff/me/assignments')
  mine(@CurrentUser() user: AuthUser): Promise<AssignmentsResponse> {
    return this.teaching.mine(user.id);
  }

  @Get('staff/:id/assignments')
  @RequirePermissions('teaching:read')
  forStaff(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: YearQueryDto,
  ): Promise<AssignmentsResponse> {
    return this.teaching.listForStaff(id, query.academicYearId);
  }

  @Get('academic-years/:yearId/sections/:sectionId/teaching')
  @RequirePermissions('teaching:read')
  section(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
  ): Promise<SectionTeachingResponse> {
    return this.teaching.getSectionTeaching(yearId, sectionId);
  }

  @Put('academic-years/:yearId/sections/:sectionId/class-teacher')
  @HttpCode(200)
  @RequirePermissions('teaching:assign')
  setClassTeacher(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() dto: SetTeacherDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<SectionTeachingResponse> {
    return this.teaching.setClassTeacher(yearId, sectionId, dto.staffId, actor);
  }

  @Put('academic-years/:yearId/sections/:sectionId/subjects/:subjectId/teacher')
  @HttpCode(200)
  @RequirePermissions('teaching:assign')
  setSubjectTeacher(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Body() dto: SetTeacherDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<SectionTeachingResponse> {
    return this.teaching.setSubjectTeacher(
      yearId,
      sectionId,
      subjectId,
      dto.staffId,
      actor,
    );
  }
}
