import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { StorageService } from '../../infra/storage/storage.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { normalizeImage } from '../school/school-images.service.js';
import { MAX_DOCUMENT_BYTES } from '../students/student-documents.service.js';

@Controller()
export class WebsiteFilesController {
  constructor(
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}
  @Post('admin/website/files')
  @RequirePermissions('school:manage')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { files: 1, fields: 0, fileSize: MAX_DOCUMENT_BYTES },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: AuthUser,
  ) {
    if (!file?.buffer.length)
      throw new BadRequestException('Attach an image or PDF in the file field');
    const pdf = file.buffer.subarray(0, 5).toString() === '%PDF-';
    if (pdf && !file.buffer.subarray(-1024).includes(Buffer.from('%%EOF')))
      throw new BadRequestException('Incomplete PDF');
    const buffer = pdf
      ? file.buffer
      : (
          await normalizeImage(file.buffer, {
            maxBytes: MAX_DOCUMENT_BYTES,
            maxWidth: 2400,
            maxHeight: 2400,
            minSide: 16,
          })
        ).data;
    const id = randomUUID(),
      name = id + (pdf ? '.pdf' : '.png'),
      contentType = pdf ? 'application/pdf' : 'image/png';
    await this.storage.put('website/' + name, buffer, contentType);
    await this.audit.record({
      actor,
      action: 'website.saved',
      entityType: 'WebsiteFile',
      entityId: id,
      details: { operation: 'upload', contentType, size: buffer.length },
    });
    return {
      url: '/api/v1/public/website/files/' + name,
      contentType,
      sizeBytes: buffer.length,
    };
  }
  @Public()
  @Get('public/website/files/:name')
  async download(@Param('name') name: string, @Res() res: Response) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|pdf)$/.test(
        name,
      )
    )
      throw new NotFoundException('File not found');
    const body = await this.storage.get('website/' + name);
    if (!body) throw new NotFoundException('File not found');
    const pdf = name.endsWith('.pdf');
    res
      .set({
        'Content-Type': pdf ? 'application/pdf' : 'image/png',
        'Content-Disposition': pdf ? 'attachment' : 'inline',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'X-Content-Type-Options': 'nosniff',
      })
      .send(body);
  }
}
