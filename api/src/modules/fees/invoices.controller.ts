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
import { CreateAdHocInvoiceDto, InvoiceRunDto } from './dto/invoice-run.dto.js';
import { ListInvoicesQueryDto } from './dto/invoice-query.dto.js';
import { InvoiceGenerationService } from './invoice-generation.service.js';
import { InvoicesService } from './invoices.service.js';

@Controller()
export class InvoicesController {
  constructor(
    private readonly generation: InvoiceGenerationService,
    private readonly invoices: InvoicesService,
  ) {}

  /** Shows exactly what a run would create. Writes nothing and uses no invoice numbers. */
  @Post('invoices/preview')
  @HttpCode(200)
  @RequirePermissions('fees:invoice-generate')
  preview(@Body() dto: InvoiceRunDto) {
    return this.generation.preview(dto);
  }

  @Post('invoices/generate')
  @HttpCode(200)
  @RequirePermissions('fees:invoice-generate')
  generate(@Body() dto: InvoiceRunDto, @CurrentUser() actor: AuthUser) {
    return this.generation.commit(dto, actor);
  }

  @Post('enrollments/:id/invoices/ad-hoc')
  @RequirePermissions('fees:invoice-generate')
  adHoc(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateAdHocInvoiceDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.generation.createAdHoc(id, dto, actor);
  }

  @Get('invoices')
  @RequirePermissions('fees:read')
  list(@Query() query: ListInvoicesQueryDto) {
    return this.invoices.list(query);
  }

  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.invoices.get(id, actor);
  }

  @Get('enrollments/:id/invoices')
  @RequirePermissions('fees:read')
  forEnrollment(@Param('id', ParseUUIDPipe) id: string) {
    return this.invoices.forEnrollment(id);
  }
}
