import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import {
  PrintReportCardsDto,
  ReportCardQueryDto,
} from './dto/print-report-cards.dto.js';
import { ReportCardService } from './report-card.service.js';

// No @RequirePermissions: print rights and the per-section scope are applied by the service.
@Controller()
export class PrintController {
  constructor(private readonly reportCards: ReportCardService) {}

  /** A print batch. May contain signature images, so it is never cached. */
  @Post('print/report-cards')
  @HttpCode(200)
  async print(
    @Body() dto: PrintReportCardsDto,
    @CurrentUser() actor: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'private, no-store');
    return this.reportCards.build(dto, actor);
  }

  @Get('enrollments/:enrollmentId/report-card')
  one(
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Query() q: ReportCardQueryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.reportCards.single(enrollmentId, q, actor);
  }
}
