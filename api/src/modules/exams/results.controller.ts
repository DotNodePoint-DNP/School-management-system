import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { ResultsQueryDto } from './dto/results-query.dto.js';
import { ResultsService } from './results.service.js';

const BASE = 'academic-years/:yearId/classes/:classId/results';

@Controller()
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  @Get(`${BASE}/preview`)
  @RequirePermissions('results:preview')
  preview(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query() q: ResultsQueryDto,
  ) {
    return this.results.preview(yearId, classId, q.examId);
  }

  @Get(`${BASE}/runs`)
  @RequirePermissions('results:read-all')
  runs(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query() q: ResultsQueryDto,
  ) {
    return this.results.runs(yearId, classId, q.examId);
  }

  @Get(`${BASE}/roll-order`)
  @RequirePermissions('results:read-all')
  rollOrder(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query() q: ResultsQueryDto,
  ) {
    return this.results.rollOrder(yearId, classId, q.sectionId);
  }

  @Get(BASE)
  list(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query() q: ResultsQueryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.results.list(yearId, classId, q, actor);
  }

  @Get('enrollments/:enrollmentId/report-card')
  reportCard(
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Query() q: ResultsQueryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.results.reportCard(enrollmentId, q, actor);
  }
}
