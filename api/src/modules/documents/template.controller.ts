import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  PrepareDocuments,
  IssueDocuments,
  SaveTemplate,
  PublishTemplate,
} from './dto/template.dto.js';
import { TemplateService } from './template.service.js';

@Controller('documents')
export class TemplateController {
  constructor(private service: TemplateService) {}
  private editor(actor: AuthUser) {
    if (
      !actor.permissions.some(
        (p) => p === 'documents:design' || p === 'documents:publish',
      )
    )
      throw new ForbiddenException();
  }
  @Get('templates') templates(@CurrentUser() actor: AuthUser) {
    this.editor(actor);
    return this.service.list();
  }
  @Post('templates')
  @RequirePermissions('documents:design')
  create(@Body() dto: SaveTemplate, @CurrentUser() actor: AuthUser) {
    return this.service.save(dto, actor);
  }
  @Put('templates/:id')
  @RequirePermissions('documents:design')
  save(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveTemplate,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.save(dto, actor, id);
  }
  @Post('templates/:id/publish')
  @RequirePermissions('documents:publish')
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishTemplate,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.service.publish(id, dto.revision, actor);
  }
  @Post('artwork')
  @RequirePermissions('documents:design')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 4194304 } }))
  artwork(@UploadedFile() file?: Express.Multer.File) {
    return this.service.artwork(file);
  }
  @Get('artwork/:id')
  @Header('Cache-Control', 'private, no-store')
  art(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    this.editor(actor);
    return this.service.art(id).then((image) => ({ image }));
  }

  @Get('versions')
  @RequirePermissions('documents:issue')
  versions() {
    return this.service.versions();
  }
  @Get('options')
  @RequirePermissions('documents:issue')
  options() {
    return this.service.options();
  }
  @Get('roster')
  @RequirePermissions('documents:issue')
  @Header('Cache-Control', 'private, no-store')
  roster(
    @Query('year', ParseUUIDPipe) year: string,
    @Query('section', ParseUUIDPipe) section: string,
  ) {
    return this.service.roster(year, section);
  }
  @Post('preview')
  @RequirePermissions('documents:issue')
  @Header('Cache-Control', 'private, no-store')
  preview(@Body() dto: PrepareDocuments, @CurrentUser() actor: AuthUser) {
    return this.service.prepare(dto, actor);
  }
  @Post('issue')
  @RequirePermissions('documents:issue')
  @Header('Cache-Control', 'private, no-store')
  issue(@Body() dto: IssueDocuments, @CurrentUser() actor: AuthUser) {
    return this.service.issue(dto, actor);
  }
  @Get('register')
  @RequirePermissions('documents:issue')
  @Header('Cache-Control', 'private, no-store')
  register(@Query('q') query?: string) {
    return this.service.register(
      typeof query === 'string' ? query.slice(0, 100) : '',
    );
  }
  @Get('register/:id')
  @RequirePermissions('documents:issue')
  @Header('Cache-Control', 'private, no-store')
  copy(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.service.reprint(id, actor);
  }
}
