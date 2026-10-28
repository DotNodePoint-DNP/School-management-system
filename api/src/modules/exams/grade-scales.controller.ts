import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import {
  CopyGradeScaleDto,
  CreateGradeScaleDto,
  ReplaceGradeScaleDto,
} from './dto/grade-scale.dto.js';
import {
  GradeScalesService,
  type GradeScaleResponse,
} from './grade-scales.service.js';

@Controller('grade-scales')
export class GradeScalesController {
  constructor(private readonly scales: GradeScalesService) {}

  @Get()
  @RequirePermissions('exams:read')
  list(): Promise<GradeScaleResponse[]> {
    return this.scales.list();
  }

  @Get(':id')
  @RequirePermissions('exams:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<GradeScaleResponse> {
    return this.scales.get(id);
  }

  @Post()
  @RequirePermissions('exams:manage')
  create(
    @Body() dto: CreateGradeScaleDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<GradeScaleResponse> {
    return this.scales.create(dto, actor);
  }

  @Put(':id')
  @RequirePermissions('exams:manage')
  replace(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceGradeScaleDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<GradeScaleResponse> {
    return this.scales.replace(id, dto, actor);
  }

  @Post(':id/copy')
  @RequirePermissions('exams:manage')
  copy(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CopyGradeScaleDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<GradeScaleResponse> {
    return this.scales.copy(id, dto, actor);
  }

  @Post(':id/set-default')
  @HttpCode(200)
  @RequirePermissions('exams:manage')
  setDefault(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<GradeScaleResponse> {
    return this.scales.setDefault(id, actor);
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermissions('exams:manage')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ deleted: true }> {
    await this.scales.remove(id, actor);
    return { deleted: true };
  }
}
