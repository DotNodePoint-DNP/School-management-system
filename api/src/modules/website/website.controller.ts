import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { WebsiteSection } from './legacy-section.js';
import { PaginationQueryDto } from '../../common/dto/pagination.dto.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { WebsiteEntryDto } from './dto/website-entry.dto.js';
import { WebsiteService } from './website.service.js';

@Controller('website')
export class WebsiteController {
  constructor(private readonly website: WebsiteService) {}

  @Public()
  @Get('profile')
  profile() {
    return this.website.profile();
  }

  @Public()
  @Get('profile/logo')
  async logo(@Res() response: Response) {
    const file = await this.website.logo();
    response
      .set({
        'Content-Type': file.contentType,
        'Cache-Control': 'public, max-age=60',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        ETag: `"${file.sha256}"`,
      })
      .send(file.data);
  }

  @Public()
  @Get('classes')
  classes() {
    return this.website.classes();
  }

  @Public()
  @Get('sections/:section')
  section(
    @Param('section', new ParseEnumPipe(WebsiteSection))
    section: WebsiteSection,
    @Query() query: PaginationQueryDto,
  ) {
    return this.website.list(section, query);
  }

  @RequirePermissions('school:manage')
  @Get('manage/:section')
  manage(
    @Param('section', new ParseEnumPipe(WebsiteSection))
    section: WebsiteSection,
    @Query() query: PaginationQueryDto,
  ) {
    return this.website.list(section, query, true);
  }

  @RequirePermissions('school:manage')
  @Post('entries')
  create(@Body() body: WebsiteEntryDto, @CurrentUser() actor: AuthUser) {
    return this.website.save(body, actor);
  }

  @RequirePermissions('school:manage')
  @Put('entries/:id')
  replace(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: WebsiteEntryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.website.save(body, actor, id);
  }
}
