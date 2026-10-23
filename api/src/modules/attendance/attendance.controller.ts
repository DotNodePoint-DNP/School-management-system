import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { AttendanceReportsService } from './attendance-reports.service.js';
import {
  AttendanceService,
  type RosterResponse,
} from './attendance.service.js';
import { ChangeAttendanceDto } from './dto/change-attendance.dto.js';
import {
  ChangesQueryDto,
  PendingQueryDto,
  ReportRangeQueryDto,
  StudentHistoryQueryDto,
} from './dto/report-query.dto.js';
import { SubmitAttendanceDto } from './dto/submit-attendance.dto.js';

@Controller()
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly reports: AttendanceReportsService,
  ) {}

  /** Dates in the path are AD (YYYY-MM-DD). Use GET /dates/convert for BS. */
  @Get('academic-years/:yearId/sections/:sectionId/attendance/:date')
  roster(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Param('date') date: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<RosterResponse> {
    return this.attendance.getRoster(yearId, sectionId, date, actor);
  }

  @Put('academic-years/:yearId/sections/:sectionId/attendance/:date')
  @HttpCode(200)
  submit(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Param('date') date: string,
    @Body() dto: SubmitAttendanceDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<RosterResponse> {
    return this.attendance.submit(yearId, sectionId, date, dto, actor);
  }

  @Patch(
    'academic-years/:yearId/sections/:sectionId/attendance/:date/records/:enrollmentId',
  )
  change(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Param('date') date: string,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body() dto: ChangeAttendanceDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.attendance.changeRecord(
      yearId,
      sectionId,
      date,
      enrollmentId,
      dto,
      actor,
    );
  }

  @Get('academic-years/:yearId/sections/:sectionId/attendance-summary')
  sectionSummary(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Query() query: ReportRangeQueryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.reports.sectionSummary(yearId, sectionId, query, actor);
  }

  @Get('students/:id/attendance')
  history(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StudentHistoryQueryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.reports.studentHistory(id, query, actor);
  }

  @Get('students/:id/attendance/summary')
  studentSummary(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ReportRangeQueryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.reports.studentSummary(id, query, actor);
  }

  @Get('attendance/pending')
  pending(@Query() query: PendingQueryDto, @CurrentUser() actor: AuthUser) {
    return this.reports.pending(query, actor);
  }

  @Get('attendance/changes')
  changes(@Query() query: ChangesQueryDto, @CurrentUser() actor: AuthUser) {
    return this.reports.changes(query, actor);
  }
}
