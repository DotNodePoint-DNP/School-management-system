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
import {
  ApplyCreditDto,
  RefundCreditDto,
  ReversePaymentDto,
  StatementQueryDto,
} from './dto/payment-corrections.dto.js';
import { PaymentCorrectionsService } from './payment-corrections.service.js';
import { ReceiptsService } from './receipts.service.js';
import { StatementsService } from './statements.service.js';

@Controller()
export class PaymentCorrectionsController {
  constructor(
    private readonly corrections: PaymentCorrectionsService,
    private readonly statements: StatementsService,
    private readonly receipts: ReceiptsService,
  ) {}

  // No @RequirePermissions: reversing needs either of two permissions, and the service decides which applies.
  @Post('payments/:id/reverse')
  @HttpCode(200)
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReversePaymentDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.corrections.reverse(id, dto, actor);
  }

  @Post('payments/:id/refund')
  @HttpCode(200)
  @RequirePermissions('fees:refund-approve')
  refund(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RefundCreditDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.corrections.refund(id, dto, actor);
  }

  @Post('credit/apply')
  @HttpCode(200)
  @RequirePermissions('fees:payment-record')
  applyCredit(@Body() dto: ApplyCreditDto, @CurrentUser() actor: AuthUser) {
    return this.corrections.applyCredit(dto, actor);
  }

  @Get('students/:id/credit')
  @RequirePermissions('fees:read')
  credit(@Param('id', ParseUUIDPipe) id: string) {
    return this.corrections.creditOf(id);
  }

  @Get('students/:id/statement')
  @RequirePermissions('fees:read')
  statement(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: StatementQueryDto,
  ) {
    return this.statements.forStudent(id, query);
  }

  /** Records a print. The web app calls this when the user presses Print, not to look at a receipt. */
  @Get('payments/:id/receipt')
  @RequirePermissions('fees:print')
  receipt(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.receipts.print(id, actor);
  }
}
