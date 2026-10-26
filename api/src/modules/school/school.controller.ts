import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Put,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { UpdateSchoolProfileDto } from './dto/school-profile.dto.js';
import { IMAGE_RULES } from './school-images.service.js';
import { SchoolService, type SchoolProfileResponse } from './school.service.js';
import type { Multer } from 'multer';

enum AssetKind {
  logo = 'logo',
  seal = 'seal',
}

@Controller('school')
export class SchoolController {
  constructor(private readonly school: SchoolService) {}

  @Get('profile')
  profile(): Promise<SchoolProfileResponse> {
    return this.school.get();
  }

  @Patch('profile')
  @RequirePermissions('school:manage')
  update(
    @Body() dto: UpdateSchoolProfileDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<SchoolProfileResponse> {
    return this.school.update(dto, actor);
  }

  @Get('profile/history')
  @RequirePermissions('school:manage')
  history() {
    return this.school.history();
  }

  @Get('profile/history/:version')
  @RequirePermissions('school:manage')
  historyVersion(@Param('version', ParseIntPipe) version: number) {
    return this.school.historyVersion(version);
  }

  @Put('logo')
  @RequirePermissions('school:manage')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: IMAGE_RULES.LOGO.maxBytes, files: 1 },
    }),
  )
  setLogo(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: AuthUser,
  ): Promise<SchoolProfileResponse> {
    return this.school.setImage('LOGO', file?.buffer, actor);
  }

  @Delete('logo')
  @HttpCode(200)
  @RequirePermissions('school:manage')
  removeLogo(@CurrentUser() actor: AuthUser): Promise<SchoolProfileResponse> {
    return this.school.removeImage('LOGO', actor);
  }

  @Put('seal')
  @RequirePermissions('school:manage')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: IMAGE_RULES.SEAL.maxBytes, files: 1 },
    }),
  )
  setSeal(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() actor: AuthUser,
  ): Promise<SchoolProfileResponse> {
    return this.school.setImage('SEAL', file?.buffer, actor);
  }

  @Delete('seal')
  @HttpCode(200)
  @RequirePermissions('school:manage')
  removeSeal(@CurrentUser() actor: AuthUser): Promise<SchoolProfileResponse> {
    return this.school.removeImage('SEAL', actor);
  }

  /** Raw image bytes (not wrapped in the JSON envelope). The web app fetches it with the access token and shows it as a blob. */
  @Get('assets/:kind')
  async asset(
    @Param('kind', new ParseEnumPipe(AssetKind)) kind: AssetKind,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.school.readImage(
      kind === AssetKind.logo ? 'LOGO' : 'SEAL',
    );
    const etag = `"${file.sha256}"`;
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.status(200).type(file.contentType).end(file.data);
  }
}
