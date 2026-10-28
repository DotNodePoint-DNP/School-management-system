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
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import {
  CreateSignatoryDto,
  SetSignatureModeDto,
  UpdateSignatoryDto,
} from './dto/signatory.dto.js';
import { IMAGE_RULES } from './school-images.service.js';
import {
  SignaturesService,
  type SignatoryResponse,
  type StaffSignatureResponse,
} from './signatures.service.js';

const UPLOAD = FileInterceptor('file', {
  limits: { fileSize: IMAGE_RULES.SIGNATURE.maxBytes, files: 1 },
});

/** A signature image is a forgery risk: it is never cached, and only reachable through these permissioned routes. */
function sendImage(
  res: Response,
  file: { data: Buffer; contentType: string },
): void {
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).type(file.contentType).end(file.data);
}

@Controller()
export class SignaturesController {
  constructor(private readonly signatures: SignaturesService) {}

  @Get('school/signatories')
  @RequirePermissions('school:manage-signatories')
  list(): Promise<SignatoryResponse[]> {
    return this.signatures.list();
  }

  @Post('school/signatories')
  @RequirePermissions('school:manage-signatories')
  create(
    @Body() dto: CreateSignatoryDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<SignatoryResponse> {
    return this.signatures.create(dto, actor);
  }

  @Get('school/signatories/:id')
  @RequirePermissions('school:manage-signatories')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<SignatoryResponse> {
    return this.signatures.get(id);
  }

  @Patch('school/signatories/:id')
  @RequirePermissions('school:manage-signatories')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSignatoryDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<SignatoryResponse> {
    return this.signatures.update(id, dto, actor);
  }

  @Put('school/signatories/:id/signature')
  @RequirePermissions('school:manage-signatories')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(UPLOAD)
  setSignature(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: AuthUser,
  ): Promise<SignatoryResponse> {
    return this.signatures.setSignature(id, file?.buffer, actor);
  }

  @Delete('school/signatories/:id/signature')
  @HttpCode(200)
  @RequirePermissions('school:manage-signatories')
  removeSignature(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<SignatoryResponse> {
    return this.signatures.removeSignature(id, actor);
  }

  @Get('school/signatories/:id/signature')
  @RequirePermissions('school:manage-signatories')
  async image(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    sendImage(res, await this.signatures.readSignature(id));
  }

  // ---- class teachers' own signatures

  @Get('staff/:id/signature')
  @RequirePermissions('school:manage-signatories')
  staff(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StaffSignatureResponse> {
    return this.signatures.staffSignature(id);
  }

  @Put('staff/:id/signature')
  @RequirePermissions('school:manage-signatories')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(UPLOAD)
  setStaffSignature(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: AuthUser,
  ): Promise<StaffSignatureResponse> {
    return this.signatures.setStaffSignature(id, file?.buffer, actor);
  }

  @Patch('staff/:id/signature')
  @RequirePermissions('school:manage-signatories')
  setStaffMode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetSignatureModeDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<StaffSignatureResponse> {
    return this.signatures.setStaffMode(id, dto.mode, actor);
  }

  @Delete('staff/:id/signature')
  @HttpCode(200)
  @RequirePermissions('school:manage-signatories')
  removeStaffSignature(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<StaffSignatureResponse> {
    return this.signatures.removeStaffSignature(id, actor);
  }

  @Get('staff/:id/signature/image')
  @RequirePermissions('school:manage-signatories')
  async staffImage(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    sendImage(res, await this.signatures.readStaffSignature(id));
  }
}
