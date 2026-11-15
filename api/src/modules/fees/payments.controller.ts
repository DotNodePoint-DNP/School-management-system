import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import {
  DuesQueryDto,
  ListPaymentsQueryDto,
  RecordPaymentDto,
} from './dto/payment.dto.js';
import { PaymentsService } from './payments.service.js';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** Records a receipt. Sending the same idempotencyKey again returns the same receipt (duplicate: true). */
  @Post('payments')
  @RequirePermissions('fees:payment-record')
  record(@Body() dto: RecordPaymentDto, @CurrentUser() actor: AuthUser) {
    return this.payments.record(dto, actor);
  }

  @Get('payments')
  @RequirePermissions('fees:read')
  list(@Query() query: ListPaymentsQueryDto) {
    return this.payments.list(query);
  }

  @Get('payments/:id')
  @RequirePermissions('fees:read')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.payments.get(id);
  }

  @Get('dues')
  @RequirePermissions('fees:read')
  dues(@Query() query: DuesQueryDto) {
    return this.payments.dues(query.studentIds);
  }
}
