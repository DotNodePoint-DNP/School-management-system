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
  Query,
} from '@nestjs/common';
import type { Paginated } from '../../common/dto/pagination.dto.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import type { LoginOutcome } from '../guardians/parent-accounts.service.js';
import { CreateStudentDto } from './dto/create-student.dto.js';
import { ListStudentsQueryDto } from './dto/list-students-query.dto.js';
import { ReplaceStudentGuardiansDto } from './dto/replace-student-guardians.dto.js';
import { UpdateStudentDto } from './dto/update-student.dto.js';
import {
  StudentsService,
  type StudentDetail,
  type StudentListItem,
} from './students.service.js';

@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  list(
    @Query() query: ListStudentsQueryDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<Paginated<StudentListItem>> {
    return this.students.list(query, actor);
  }

  @Get(':id')
  get(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<StudentDetail> {
    return this.students.get(id, actor);
  }

  @Post()
  @RequirePermissions('students:create')
  create(
    @Body() dto: CreateStudentDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ student: StudentDetail; logins: LoginOutcome[] }> {
    return this.students.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermissions('students:update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<StudentDetail> {
    return this.students.update(id, dto, actor);
  }

  @Put(':id/guardians')
  @RequirePermissions('students:update')
  replaceGuardians(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplaceStudentGuardiansDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<StudentDetail> {
    return this.students.replaceGuardians(id, dto, actor);
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermissions('students:delete')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ deleted: true }> {
    await this.students.remove(id, actor);
    return { deleted: true };
  }
}
