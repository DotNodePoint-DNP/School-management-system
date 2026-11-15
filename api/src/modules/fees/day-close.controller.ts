import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { resolveDate, todayIso } from '../../common/utils/bs-date.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { DayCloseService } from './day-close.service.js';
import {
  CloseDayDto,
  DayQueryDto,
  ListDayClosesQueryDto,
  PendingDaysQueryDto,
  ReopenDayDto,
} from './dto/day-close.dto.js';
import { CollectionsQueryDto } from './dto/reports.dto.js';
import { ReportsService } from './reports.service.js';

@Controller()
export class DayCloseController {
  constructor(
    private readonly closes: DayCloseService,
    private readonly reports: ReportsService,
  ) {}

  @Get('day-closes/preview')
  @RequirePermissions('fees:reports')
  preview(@Query() q: DayQueryDto) {
    return this.closes.preview(
      resolveDate('date', q.date, q.dateBs) ?? todayIso(),
    );
  }

  @Get('day-closes/pending')
  @RequirePermissions('fees:reports')
  pending(@Query() q: PendingDaysQueryDto) {
    return this.closes.pending(q);
  }

  @Get('day-closes')
  @RequirePermissions('fees:reports')
  list(@Query() q: ListDayClosesQueryDto) {
    return this.closes.list(q);
  }

  @Get('day-closes/:id')
  @RequirePermissions('fees:reports')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.closes.get(id);
  }

  @Post('day-closes')
  @RequirePermissions('fees:day-close')
  close(@Body() dto: CloseDayDto, @CurrentUser() actor: AuthUser) {
    return this.closes.close(dto, actor);
  }

  @Post('day-closes/:id/reopen')
  @HttpCode(200)
  @RequirePermissions('fees:day-reopen')
  reopen(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenDayDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.closes.reopen(id, dto, actor);
  }

  @Get('reports/daily')
  @RequirePermissions('fees:reports')
  daily(@Query() q: DayQueryDto) {
    return this.reports.daily(
      resolveDate('date', q.date, q.dateBs) ?? todayIso(),
    );
  }

  @Get('reports/collections')
  @RequirePermissions('fees:reports')
  collections(@Query() q: CollectionsQueryDto) {
    return this.reports.collections(q);
  }
}
