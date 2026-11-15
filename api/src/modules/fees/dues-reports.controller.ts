import { Controller, Get, Query } from '@nestjs/common';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { BillingReportService } from './billing-report.service.js';
import { DuesReportService } from './dues-report.service.js';
import {
  BillingQueryDto,
  DuesStudentsQueryDto,
  DuesSummaryQueryDto,
} from './dto/dues-report.dto.js';

@Controller('reports')
export class DuesReportsController {
  constructor(
    private readonly dues: DuesReportService,
    private readonly billing: BillingReportService,
  ) {}

  @Get('dues')
  @RequirePermissions('fees:reports')
  summary(@Query() q: DuesSummaryQueryDto) {
    return this.dues.summary(q);
  }

  @Get('dues/students')
  @RequirePermissions('fees:reports')
  students(@Query() q: DuesStudentsQueryDto) {
    return this.dues.students(q);
  }

  @Get('billing')
  @RequirePermissions('fees:reports')
  billingSummary(@Query() q: BillingQueryDto) {
    return this.billing.summary(q);
  }
}
