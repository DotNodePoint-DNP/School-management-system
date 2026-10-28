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
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import {
  CorrectMarkDto,
  MarkChangesQueryDto,
  ReasonDto,
  SaveMarksDto,
} from './dto/marks.dto.js';
import { MarksService, type SheetResponse } from './marks.service.js';

const SHEET = 'exams/:examId/sections/:sectionId/subjects/:subjectId/marks';

// No @RequirePermissions on purpose: marks:enter and the read permissions apply per section and subject,
// so MarksAccessService decides.
@Controller()
export class MarksController {
  constructor(private readonly marks: MarksService) {}

  @Get(SHEET)
  get(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<SheetResponse> {
    return this.marks.getSheet(examId, sectionId, subjectId, actor);
  }

  @Put(SHEET)
  @HttpCode(200)
  save(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Body() dto: SaveMarksDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<SheetResponse> {
    return this.marks.saveMarks(examId, sectionId, subjectId, dto, actor);
  }

  @Post(`${SHEET}/submit`)
  @HttpCode(200)
  submit(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<SheetResponse> {
    return this.marks.submit(examId, sectionId, subjectId, actor);
  }

  @Post(`${SHEET}/reopen`)
  @HttpCode(200)
  reopen(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Body() dto: ReasonDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<SheetResponse> {
    return this.marks.reopen(examId, sectionId, subjectId, dto, actor);
  }

  @Patch(`${SHEET}/:enrollmentId`)
  correct(
    @Param('examId', ParseUUIDPipe) examId: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @Body() dto: CorrectMarkDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<SheetResponse> {
    return this.marks.correct(
      examId,
      sectionId,
      subjectId,
      enrollmentId,
      dto,
      actor,
    );
  }

  @Get('marks/changes')
  changes(@Query() query: MarkChangesQueryDto, @CurrentUser() actor: AuthUser) {
    return this.marks.changes(query, actor);
  }
}
