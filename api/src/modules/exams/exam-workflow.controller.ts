import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { ReasonDto } from './dto/marks.dto.js';
import {
  ExamWorkflowService,
  type ProgressItem,
} from './exam-workflow.service.js';
import type { ExamResponse } from './exams.service.js';

@Controller('exams/:id')
export class ExamWorkflowController {
  constructor(private readonly workflow: ExamWorkflowService) {}

  @Post('lock')
  @HttpCode(200)
  @RequirePermissions('exams:lock')
  lock(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<ExamResponse> {
    return this.workflow.lock(id, actor);
  }

  @Post('unlock')
  @HttpCode(200)
  @RequirePermissions('exams:lock')
  unlock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<ExamResponse> {
    return this.workflow.unlock(id, dto, actor);
  }

  @Post('publish')
  @HttpCode(200)
  @RequirePermissions('exams:publish')
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<ExamResponse> {
    return this.workflow.publish(id, actor);
  }

  @Get('progress')
  progress(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.workflow.progress(id, actor);
  }

  // Only ever returns the caller's own assignments, so a login is enough.
  @Get('my-sheets')
  mySheets(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<ProgressItem[]> {
    return this.workflow.mySheets(id, actor);
  }
}
