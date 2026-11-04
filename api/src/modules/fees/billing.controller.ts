import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import {
  BillingPeriodsService,
  type BillingPeriodResponse,
} from './billing-periods.service.js';
import {
  CreatePeriodDto,
  GeneratePeriodsDto,
  UpdatePeriodDto,
} from './dto/billing-period.dto.js';
import {
  CopyFeeStructureDto,
  ReplaceFeeStructureDto,
} from './dto/fee-structure.dto.js';
import {
  FeeStructuresService,
  type FeeStructureResponse,
} from './fee-structures.service.js';

@Controller('academic-years/:yearId')
export class BillingController {
  constructor(
    private readonly periods: BillingPeriodsService,
    private readonly structures: FeeStructuresService,
  ) {}

  @Get('billing-periods')
  @RequirePermissions('fees:read')
  listPeriods(
    @Param('yearId', ParseUUIDPipe) yearId: string,
  ): Promise<BillingPeriodResponse[]> {
    return this.periods.list(yearId);
  }

  @Post('billing-periods/generate')
  @HttpCode(200)
  @RequirePermissions('fees:structure-manage')
  generate(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Body() dto: GeneratePeriodsDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<BillingPeriodResponse[]> {
    return this.periods.generate(yearId, dto, actor);
  }

  @Post('billing-periods')
  @RequirePermissions('fees:structure-manage')
  createPeriod(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Body() dto: CreatePeriodDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<BillingPeriodResponse> {
    return this.periods.create(yearId, dto, actor);
  }

  @Patch('billing-periods/:id')
  @RequirePermissions('fees:structure-manage')
  updatePeriod(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePeriodDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<BillingPeriodResponse> {
    return this.periods.update(yearId, id, dto, actor);
  }

  @Delete('billing-periods/:id')
  @HttpCode(200)
  @RequirePermissions('fees:structure-manage')
  async removePeriod(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ deleted: true }> {
    await this.periods.remove(yearId, id, actor);
    return { deleted: true };
  }

  @Get('classes/:classId/fee-structure')
  @RequirePermissions('fees:read')
  getStructure(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
  ): Promise<FeeStructureResponse> {
    return this.structures.get(yearId, classId);
  }

  @Put('classes/:classId/fee-structure')
  @RequirePermissions('fees:structure-manage')
  replaceStructure(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() dto: ReplaceFeeStructureDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<FeeStructureResponse> {
    return this.structures.replace(yearId, classId, dto, actor);
  }

  @Post('fee-structure/copy-from/:sourceYearId')
  @HttpCode(200)
  @RequirePermissions('fees:structure-manage')
  copyStructure(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('sourceYearId', ParseUUIDPipe) sourceYearId: string,
    @Body() dto: CopyFeeStructureDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.structures.copy(yearId, sourceYearId, dto, actor);
  }
}
