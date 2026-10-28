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
  CopyExamSetupDto,
  CreateExamDto,
  SetExamSubjectsDto,
  UpdateExamDto,
} from './dto/exam.dto.js';
import { ExamsService, type ExamResponse } from './exams.service.js';

@Controller()
export class ExamsController {
  constructor(private readonly exams: ExamsService) {}

  @Get('academic-years/:yearId/exams')
  @RequirePermissions('exams:read')
  list(
    @Param('yearId', ParseUUIDPipe) yearId: string,
  ): Promise<ExamResponse[]> {
    return this.exams.list(yearId);
  }

  @Post('academic-years/:yearId/exams')
  @RequirePermissions('exams:manage')
  create(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Body() dto: CreateExamDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<ExamResponse> {
    return this.exams.create(yearId, dto, actor);
  }

  @Get('exams/:id')
  @RequirePermissions('exams:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ExamResponse> {
    return this.exams.get(id);
  }

  @Patch('exams/:id')
  @RequirePermissions('exams:manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExamDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<ExamResponse> {
    return this.exams.update(id, dto, actor);
  }

  @Delete('exams/:id')
  @HttpCode(200)
  @RequirePermissions('exams:manage')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ deleted: true }> {
    await this.exams.remove(id, actor);
    return { deleted: true };
  }

  @Get('exams/:id/classes/:classId/subjects')
  @RequirePermissions('exams:read')
  getSetup(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('classId', ParseUUIDPipe) classId: string,
  ) {
    return this.exams.getClassSetup(id, classId);
  }

  @Put('exams/:id/classes/:classId/subjects')
  @RequirePermissions('exams:manage')
  setSetup(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() dto: SetExamSubjectsDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.exams.setClassSetup(id, classId, dto, actor);
  }

  @Post('exams/:id/copy-setup-from/:sourceExamId')
  @HttpCode(200)
  @RequirePermissions('exams:manage')
  copySetup(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sourceExamId', ParseUUIDPipe) sourceExamId: string,
    @Body() dto: CopyExamSetupDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.exams.copySetup(id, sourceExamId, dto, actor);
  }

  @Post('exams/:id/open')
  @HttpCode(200)
  @RequirePermissions('exams:manage')
  open(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<ExamResponse> {
    return this.exams.open(id, actor);
  }
}
