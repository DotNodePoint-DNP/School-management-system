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
import {
  ClassesService,
  type ClassResponse,
  type SectionResponse,
} from './classes.service.js';
import { CreateClassDto } from './dto/create-class.dto.js';
import { CreateSectionDto } from './dto/create-section.dto.js';
import { ListClassesQueryDto } from './dto/list-classes-query.dto.js';
import { UpdateClassDto } from './dto/update-class.dto.js';
import { UpdateSectionDto } from './dto/update-section.dto.js';

@Controller('classes')
export class ClassesController {
  constructor(private readonly classes: ClassesService) {}

  @Get()
  @RequirePermissions('classes:read')
  list(@Query() query: ListClassesQueryDto): Promise<ClassResponse[]> {
    return this.classes.list(query);
  }

  @Get(':id')
  @RequirePermissions('classes:read')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ClassResponse> {
    return this.classes.get(id);
  }

  @Post()
  @RequirePermissions('classes:manage')
  create(
    @Body() dto: CreateClassDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<ClassResponse> {
    return this.classes.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('classes:manage')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClassDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<ClassResponse> {
    return this.classes.update(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermissions('classes:manage')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ deleted: true }> {
    await this.classes.remove(id, actor);
    return { deleted: true };
  }

  @Post(':id/sections')
  @RequirePermissions('classes:manage')
  createSection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateSectionDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<SectionResponse> {
    return this.classes.createSection(id, dto, actor);
  }

  @Patch(':id/sections/:sectionId')
  @RequirePermissions('classes:manage')
  updateSection(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @Body() dto: UpdateSectionDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<SectionResponse> {
    return this.classes.updateSection(id, sectionId, dto, actor);
  }

  @Delete(':id/sections/:sectionId')
  @HttpCode(200)
  @RequirePermissions('classes:manage')
  async removeSection(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sectionId', ParseUUIDPipe) sectionId: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ deleted: true }> {
    await this.classes.removeSection(id, sectionId, actor);
    return { deleted: true };
  }
}
