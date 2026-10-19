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
  Query,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { CreateSubjectDto } from './dto/create-subject.dto.js';
import { ListSubjectsQueryDto } from './dto/list-subjects-query.dto.js';
import { UpdateSubjectDto } from './dto/update-subject.dto.js';
import { SubjectsService, type SubjectResponse } from './subjects.service.js';

@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}

  @Get()
  @RequirePermissions('subjects:read')
  list(@Query() query: ListSubjectsQueryDto): Promise<SubjectResponse[]> {
    return this.subjects.list(query);
  }

  @Get(':id')
  @RequirePermissions('subjects:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SubjectResponse> {
    return this.subjects.get(id);
  }

  @Post()
  @RequirePermissions('subjects:manage')
  create(
    @Body() dto: CreateSubjectDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<SubjectResponse> {
    return this.subjects.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('subjects:manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubjectDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<SubjectResponse> {
    return this.subjects.update(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermissions('subjects:manage')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ deleted: true }> {
    await this.subjects.remove(id, actor);
    return { deleted: true };
  }
}
