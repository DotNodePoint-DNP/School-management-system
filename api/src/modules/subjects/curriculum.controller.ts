import {
  Body,
  Controller,
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
  CurriculumService,
  type CopyResult,
  type CurriculumResponse,
} from './curriculum.service.js';
import { CopyCurriculumDto } from './dto/copy-curriculum.dto.js';
import { ReplaceClassSubjectsDto } from './dto/replace-class-subjects.dto.js';
import { SetCreditHoursDto } from './dto/set-credit-hours.dto.js';

@Controller('academic-years')
export class CurriculumController {
  constructor(private readonly curriculum: CurriculumService) {}

  @Get(':yearId/classes/:classId/subjects')
  @RequirePermissions('subjects:read')
  list(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
  ): Promise<CurriculumResponse> {
    return this.curriculum.list(yearId, classId);
  }

  @Put(':yearId/classes/:classId/subjects')
  @RequirePermissions('subjects:manage')
  replace(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body() dto: ReplaceClassSubjectsDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<CurriculumResponse> {
    return this.curriculum.replace(yearId, classId, dto, actor);
  }

  @Post(':yearId/copy-subjects-from/:sourceYearId')
  @HttpCode(200)
  @RequirePermissions('subjects:manage')
  copy(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('sourceYearId', ParseUUIDPipe) sourceYearId: string,
    @Body() dto: CopyCurriculumDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<CopyResult> {
    return this.curriculum.copy(yearId, sourceYearId, dto, actor);
  }

  @Patch(':yearId/classes/:classId/subjects/:subjectId')
  @RequirePermissions('subjects:manage')
  setCreditHours(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Body() dto: SetCreditHoursDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<CurriculumResponse> {
    return this.curriculum.setCreditHours(
      yearId,
      classId,
      subjectId,
      dto.creditHours,
      actor,
    );
  }
}
