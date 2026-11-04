import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import {
  CreateFiscalYearDto,
  UpdateFiscalYearDto,
} from './dto/fiscal-year.dto.js';
import {
  FiscalYearsService,
  type FiscalYearResponse,
} from './fiscal-years.service.js';

@Controller('fiscal-years')
export class FiscalYearsController {
  constructor(private readonly fiscalYears: FiscalYearsService) {}

  @Get()
  @RequirePermissions('fees:read')
  list(): Promise<FiscalYearResponse[]> {
    return this.fiscalYears.list();
  }

  @Get('current')
  @RequirePermissions('fees:read')
  current(): Promise<FiscalYearResponse> {
    return this.fiscalYears.current();
  }

  @Get(':id')
  @RequirePermissions('fees:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<FiscalYearResponse> {
    return this.fiscalYears.get(id);
  }

  @Post()
  @RequirePermissions('fees:fiscal-manage')
  create(
    @Body() dto: CreateFiscalYearDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<FiscalYearResponse> {
    return this.fiscalYears.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('fees:fiscal-manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFiscalYearDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<FiscalYearResponse> {
    return this.fiscalYears.update(id, dto, actor);
  }

  @Post(':id/close')
  @HttpCode(200)
  @RequirePermissions('fees:fiscal-manage')
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<FiscalYearResponse> {
    return this.fiscalYears.close(id, actor);
  }
}
