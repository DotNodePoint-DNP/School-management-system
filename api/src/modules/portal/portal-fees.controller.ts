import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { NoStoreInterceptor } from '../../common/interceptors/no-store.interceptor.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import {
  PortalInvoicesQueryDto,
  PortalPaymentsQueryDto,
  PortalPrintInvoiceDto,
  PortalPrintReceiptDto,
  PortalPrintReportCardDto,
  PortalPrintStatementDto,
  PortalStatementQueryDto,
} from './dto/portal-fees.dto.js';
import { PortalFeesService } from './portal-fees.service.js';
import { PortalPrintService } from './portal-print.service.js';

@Controller('portal')
@UseInterceptors(NoStoreInterceptor)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
export class PortalFeesController {
  constructor(
    private readonly fees: PortalFeesService,
    private readonly print: PortalPrintService,
  ) {}

  @Get('fees')
  @RequirePermissions('portal:access')
  overview(@CurrentUser() actor: AuthUser) {
    return this.fees.overview(actor);
  }

  @Get('children/:studentId/fees')
  @RequirePermissions('portal:access')
  childFees(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.fees.childFees(actor, studentId);
  }

  @Get('children/:studentId/invoices')
  @RequirePermissions('portal:access')
  invoices(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() q: PortalInvoicesQueryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.fees.invoices(actor, studentId, q);
  }

  @Get('invoices/:id')
  @RequirePermissions('portal:access')
  invoice(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.fees.invoiceDetail(actor, id);
  }

  @Get('children/:studentId/payments')
  @RequirePermissions('portal:access')
  payments(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() q: PortalPaymentsQueryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.fees.payments(actor, studentId, q);
  }

  @Get('payments/:id')
  @RequirePermissions('portal:access')
  payment(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.fees.paymentDetail(actor, id);
  }

  @Get('children/:studentId/statement')
  @RequirePermissions('portal:access')
  statement(
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query() q: PortalStatementQueryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.fees.statement(actor, studentId, q);
  }

  // ---- printable parent copies (the browser's Print, or Save as PDF)

  @Post('print/report-card')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @RequirePermissions('portal:access')
  printReportCard(
    @Body() dto: PortalPrintReportCardDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.print.reportCard(actor, dto);
  }

  @Post('print/receipt')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @RequirePermissions('portal:access')
  printReceipt(
    @Body() dto: PortalPrintReceiptDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.print.receipt(actor, dto);
  }

  @Post('print/invoice')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @RequirePermissions('portal:access')
  printInvoice(
    @Body() dto: PortalPrintInvoiceDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.print.invoice(actor, dto);
  }

  @Post('print/statement')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @RequirePermissions('portal:access')
  printStatement(
    @Body() dto: PortalPrintStatementDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.print.statement(actor, dto);
  }
}
