import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { StudentDocumentType } from '../../generated/prisma/enums.js';
import { MAX_DOCUMENT_BYTES, StudentDocumentsService } from './student-documents.service.js';
import {
  ParseEnumPipe, Res, UploadedFile, UseInterceptors,
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
import {
  StatusChangeResult,
  StudentLifecycleService,
} from './student-lifecycle.service.js';
import { ChangeStudentStatusDto } from './dto/change-student-status.dto.js';

@Controller('students')
export class StudentsController {
  constructor(
    private readonly students: StudentsService,
    private readonly documents: StudentDocumentsService,
    private readonly lifecycle: StudentLifecycleService,
  ) {}

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

  @Get(':id/documents')
  @RequirePermissions('students:read-all')
  listDocuments(@Param('id', ParseUUIDPipe) id: string) {
    return this.documents.list(id);
  }

  @Post(':id/documents/:type')
  @RequirePermissions('students:update', 'students:read-all')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES, files: 1 } }))
  async uploadDocument(@Param('id', ParseUUIDPipe) id: string, @Param('type', new ParseEnumPipe(StudentDocumentType)) type: StudentDocumentType, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() actor: AuthUser) {
    await this.students.get(id, actor);
    return this.documents.upload(id, type, actor, file);
  }

  @Get(':id/documents/:documentId')
  @RequirePermissions('students:read-all')
  async download(@Param('id', ParseUUIDPipe) id: string, @Param('documentId', ParseUUIDPipe) documentId: string, @Res() res: Response) {
    const file = await this.documents.file(id, documentId);
    res.set({ 'Content-Type': file.mimeType, 'Content-Disposition': 'attachment', 'Cache-Control': 'private, no-store' }).send(file.body);
  }

  @Get(':id/photo')
  async photo(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser, @Res() res: Response) {
    await this.students.get(id, actor);
    const photo = await this.documents.photo(id);
    res.set('Cache-Control', 'private, no-store');
    if (!photo) { res.status(204).end(); return; }
    res.type(photo.mimeType).send(photo.body);
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

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermissions('students:change-status')
  changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStudentStatusDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<StatusChangeResult> {
    return this.lifecycle.changeStatus(id, dto, actor);
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @RequirePermissions('students:change-status')
  reactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<StatusChangeResult> {
    return this.lifecycle.reactivate(id, actor);
  }
}
