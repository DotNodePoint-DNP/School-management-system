import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { SetExamReleaseDto } from './dto/exam-release.dto.js';
import { ExamReleaseService } from './exam-release.service.js';

@Controller()
export class ExamReleaseController {
  constructor(private readonly release: ExamReleaseService) {}

  @Get('academic-years/:yearId/exam-releases')
  @RequirePermissions('exams:release')
  list(@Param('yearId', ParseUUIDPipe) yearId: string) {
    return this.release.list(yearId);
  }

  @Put('exams/:id/release')
  @RequirePermissions('exams:release')
  set(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetExamReleaseDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.release.set(id, dto, actor);
  }
}
