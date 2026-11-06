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
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { AdjustmentsService } from './adjustments.service.js';
import {
  DecideAdjustmentDto,
  ListAdjustmentsQueryDto,
  ReissueInvoiceDto,
  RejectAdjustmentDto,
  RequestAdjustmentDto,
  VoidInvoiceDto,
} from './dto/invoice-corrections.dto.js';
import { InvoiceLifecycleService } from './invoice-lifecycle.service.js';

@Controller()
export class InvoiceCorrectionsController {
  constructor(
    private readonly lifecycle: InvoiceLifecycleService,
    private readonly adjustments: AdjustmentsService,
  ) {}

  @Post('invoices/:id/void')
  @HttpCode(200)
  @RequirePermissions('fees:invoice-void')
  void(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidInvoiceDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.lifecycle.void(id, dto, actor);
  }

  @Post('invoices/:id/reissue/preview')
  @HttpCode(200)
  @RequirePermissions('fees:invoice-generate')
  reissuePreview(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReissueInvoiceDto,
  ) {
    return this.lifecycle.reissuePreview(id, dto);
  }

  @Post('invoices/:id/reissue')
  @RequirePermissions('fees:invoice-generate')
  reissue(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReissueInvoiceDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.lifecycle.reissue(id, dto, actor);
  }

  @Post('invoices/:id/adjustments')
  @RequirePermissions('fees:adjust')
  request(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RequestAdjustmentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.adjustments.request(id, dto, actor);
  }

  @Get('adjustments')
  @RequirePermissions('fees:read')
  list(
    @Query() query: ListAdjustmentsQueryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.adjustments.list(query, actor);
  }

  @Get('adjustments/:id')
  @RequirePermissions('fees:read')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.adjustments.get(id, actor);
  }

  @Post('adjustments/:id/approve')
  @HttpCode(200)
  @RequirePermissions('fees:adjust-approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecideAdjustmentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.adjustments.approve(id, dto, actor);
  }

  @Post('adjustments/:id/reject')
  @HttpCode(200)
  @RequirePermissions('fees:adjust-approve')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectAdjustmentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.adjustments.reject(id, dto, actor);
  }

  @Post('adjustments/:id/withdraw')
  @HttpCode(200)
  @RequirePermissions('fees:adjust')
  withdraw(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.adjustments.withdraw(id, actor);
  }
}
