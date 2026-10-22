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
import { SetOptionalSubjectsDto } from './dto/set-optional-subjects.dto.js';
import {
  SubjectChoicesService,
  type EnrollmentChoicesResponse,
  type SubjectRosterResponse,
} from './subject-choices.service.js';

@Controller()
export class SubjectChoicesController {
  constructor(private readonly choices: SubjectChoicesService) {}

  @Get('enrollments/:id/optional-subjects')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<EnrollmentChoicesResponse> {
    return this.choices.get(id, actor);
  }

  @Put('enrollments/:id/optional-subjects')
  @RequirePermissions('enrollments:manage')
  replace(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetOptionalSubjectsDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<EnrollmentChoicesResponse> {
    return this.choices.replace(id, dto, actor);
  }

  @Get(
    'academic-years/:yearId/sections/:sectionId/subjects/:subjectId/students',
  )
  roster(
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<SubjectRosterResponse> {
    return this.choices.roster(yearId, sectionId, subjectId, actor);
  }
}
