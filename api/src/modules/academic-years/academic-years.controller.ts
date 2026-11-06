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
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import {
  AcademicYearsService,
  type AcademicYearResponse,
  type TermResponse,
} from './academic-years.service.js';
import { AdjustDatesDto } from './dto/adjust-dates.dto.js';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto.js';
import { CreateTermDto } from './dto/create-term.dto.js';
import { UpdateAcademicYearDto } from './dto/update-academic-year.dto.js';
import { UpdateTermDto } from './dto/update-term.dto.js';
import { CloseYearDto } from './dto/close-year.dto.js';

@Controller('academic-years')
export class AcademicYearsController {
  constructor(private readonly years: AcademicYearsService) {}

  @Get()
  @RequirePermissions('academic-years:read')
  list(): Promise<AcademicYearResponse[]> {
    return this.years.list();
  }

  @Get(':id')
  @RequirePermissions('academic-years:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AcademicYearResponse> {
    return this.years.get(id);
  }

  @Post()
  @RequirePermissions('academic-years:manage')
  create(
    @Body() dto: CreateAcademicYearDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<AcademicYearResponse> {
    return this.years.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('academic-years:manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAcademicYearDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<AcademicYearResponse> {
    return this.years.update(id, dto, actor);
  }

  @Post(':id/adjust-dates')
  @HttpCode(200)
  @RequirePermissions('academic-years:adjust-dates')
  adjustDates(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdjustDatesDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<AcademicYearResponse> {
    return this.years.adjustDates(id, dto, actor);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @RequirePermissions('academic-years:manage')
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<AcademicYearResponse> {
    return this.years.activate(id, actor);
  }

  @Post(':id/close')
  @HttpCode(200)
  @RequirePermissions('academic-years:manage')
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CloseYearDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<AcademicYearResponse> {
    return this.years.close(id, dto, actor);
  }

  @Get(':id/closing-checklist')
  @RequirePermissions('academic-years:read')
  closingChecklist(@Param('id', ParseUUIDPipe) id: string) {
    return this.years.closingChecklist(id);
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermissions('academic-years:manage')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ deleted: true }> {
    await this.years.remove(id, actor);
    return { deleted: true };
  }

  @Post(':id/terms')
  @RequirePermissions('academic-years:manage')
  createTerm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTermDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<TermResponse> {
    return this.years.createTerm(id, dto, actor);
  }

  @Patch(':id/terms/:termId')
  @RequirePermissions('academic-years:manage')
  updateTerm(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('termId', ParseUUIDPipe) termId: string,
    @Body() dto: UpdateTermDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<TermResponse> {
    return this.years.updateTerm(id, termId, dto, actor);
  }

  @Delete(':id/terms/:termId')
  @HttpCode(200)
  @RequirePermissions('academic-years:manage')
  async removeTerm(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('termId', ParseUUIDPipe) termId: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ deleted: true }> {
    await this.years.removeTerm(id, termId, actor);
    return { deleted: true };
  }
}
