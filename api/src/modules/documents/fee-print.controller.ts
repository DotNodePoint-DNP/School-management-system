import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import {
  PrintFeeVouchersDto,
  PrintInvoicesDto,
  PrintReceiptsDto,
  PrintStatementsDto,
} from './dto/print-fee-documents.dto.js';
import { FeeDocumentsService } from './fee-documents.service.js';

/** Every batch may carry signature images, so none of them is ever cached. */
const noStore = (res: Response): void =>
  void res.setHeader('Cache-Control', 'private, no-store');

@Controller('print')
export class FeePrintController {
  constructor(private readonly docs: FeeDocumentsService) {}

  @Post('receipts')
  @HttpCode(200)
  @RequirePermissions('fees:print')
  receipts(
    @Body() dto: PrintReceiptsDto,
    @CurrentUser() actor: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    return this.docs.receipts(dto, actor);
  }

  @Post('invoices')
  @HttpCode(200)
  @RequirePermissions('fees:print')
  invoices(
    @Body() dto: PrintInvoicesDto,
    @CurrentUser() actor: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    return this.docs.invoices(dto, actor);
  }

  @Post('statements')
  @HttpCode(200)
  @RequirePermissions('fees:print')
  statements(
    @Body() dto: PrintStatementsDto,
    @CurrentUser() actor: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    return this.docs.statements(dto, actor);
  }

  @Post('fee-vouchers')
  @HttpCode(200)
  @RequirePermissions('fees:print')
  feeVouchers(
    @Body() dto: PrintFeeVouchersDto,
    @CurrentUser() actor: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    noStore(res);
    return this.docs.feeVouchers(dto, actor);
  }
}
