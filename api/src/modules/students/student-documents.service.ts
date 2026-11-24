import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { StudentDocumentType } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../auth/auth.types.js';
import { AuditService } from '../audit-logs/audit.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { normalizeImage } from '../school/school-images.service.js';

export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const metadata = { id: true, type: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true } as const;

@Injectable()
export class StudentDocumentsService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly audit: AuditService) {}

  async list(studentId: string) {
    const rows = await this.prisma.studentDocument.findMany({ where: { studentId }, select: metadata, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    return rows.map(row => ({ ...row, sizeBytes: Number(row.sizeBytes) }));
  }

  async upload(studentId: string, type: StudentDocumentType, actor: AuthUser, file?: Express.Multer.File) {
    if (!file?.buffer.length) throw new BadRequestException('Choose a file to upload');
    const pdf = type !== 'PROFILE_PHOTO' && file.buffer.subarray(0, 5).toString() === '%PDF-';
    const content = pdf ? file.buffer : (await normalizeImage(file.buffer, {
      maxBytes: MAX_DOCUMENT_BYTES, maxWidth: 2400, maxHeight: 2400, minSide: 32,
    })).data;
    const mimeType = pdf ? 'application/pdf' : 'image/png';
    const storageKey = `students/${studentId}/${randomUUID()}`;
    await this.storage.put(storageKey, content, mimeType);
    const row = await this.prisma.studentDocument.create({ data: {
        studentId, storageKey, type, originalName: file.originalname, sizeBytes: content.length, mimeType,
      }, select: metadata }).catch(async (error: unknown) => {
        await this.storage.delete(storageKey);
        throw error;
      });
    await this.audit.record({ actor, action: 'student.document_uploaded', entityType: 'student', entityId: studentId, details: { documentId: row.id, type } });
    return { ...row, sizeBytes: Number(row.sizeBytes) };
  }

  async file(studentId: string, documentId: string) {
    const row = await this.prisma.studentDocument.findFirst({ where: { studentId, id: documentId }, select: { storageKey: true, mimeType: true } });
    if (!row) throw new NotFoundException('Document not found');
    const body = await this.storage.get(row.storageKey);
    if (!body) throw new NotFoundException('Document file unavailable');
    return { body, mimeType: row.mimeType };
  }

  async photo(studentId: string) {
    const latest = await this.prisma.studentDocument.findFirst({ where: { studentId, type: 'PROFILE_PHOTO' }, select: { id: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    return latest ? this.file(studentId, latest.id) : null;
  }
}
