import {
  Controller, Res,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { NoStoreInterceptor } from '../../common/interceptors/no-store.interceptor.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import {
  PortalAttendanceQueryDto,
  PortalReportCardQueryDto,
} from './dto/portal.dto.js';
import { PortalResultsService } from './portal-results.service.js';
import { PortalService } from './portal.service.js';

import type { Response } from 'express';
import { StudentDocumentsService } from '../students/student-documents.service.js';
import { PortalAccessService } from './portal-access.service.js';

/** Everything here is read-only and answers only for the signed-in parent's own children. */
@Controller('portal')
@UseInterceptors(NoStoreInterceptor)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class PortalController {
  constructor(
    private readonly access: PortalAccessService,
    private readonly documents: StudentDocumentsService,
    private readonly portal: PortalService,
    private readonly results: PortalResultsService,
  ) {}

  @Get('me')
  @RequirePermissions('portal:access')
  me(@CurrentUser() actor: AuthUser) {
    return this.portal.me(actor);
  }

  @Get('home')
  @RequirePermissions('portal:access')
  home(@CurrentUser() actor: AuthUser) {
    return this.portal.home(actor);
  }

  @Get('children/:studentId')
  @RequirePermissions('portal:access')
  profile(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.portal.profile(actor, studentId);
  }

  @Get('children/:studentId/photo')
  @RequirePermissions('portal:access')
  async photo(@Param('studentId', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser, @Res() res: Response) {
    await this.access.requireChild(actor, id);
    const file = await this.documents.photo(id);
    if (!file) { res.status(204).end(); return; }
    res.type(file.mimeType).send(file.body);
  }

  @Get('children/:studentId/attendance')
  @RequirePermissions('portal:access')
  attendance(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() q: PortalAttendanceQueryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.portal.attendanceFor(actor, studentId, q);
  }

  @Get('children/:studentId/results')
  @RequirePermissions('portal:access')
  resultList(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.results.list(actor, studentId);
  }

  @Get('children/:studentId/report-card')
  @RequirePermissions('portal:access')
  reportCard(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() q: PortalReportCardQueryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.results.reportCard(actor, studentId, q);
  }
}
