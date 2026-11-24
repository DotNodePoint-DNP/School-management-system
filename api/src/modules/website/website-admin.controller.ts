import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { WebsiteAdminService } from './website-admin.service.js';
import {
  EntryDto,
  UpdateEntryDto,
  NoticeDto,
  UpdateNoticeDto,
  EventDto,
  UpdateEventDto,
  AlbumDto,
  UpdateAlbumDto,
  CareerDto,
  UpdateCareerDto,
  ListDto,
  PublishDto,
  PhotosDto,
  PhotoIdsDto,
  ApplicationStatusDto,
  InquiryStatusDto,
} from './dto/cms.dto.js';

@Controller('admin/website')
@RequirePermissions('school:manage')
export class WebsiteAdminController {
  constructor(private readonly cms: WebsiteAdminService) {}

  @Get('entries') listEntry(@Query() query: ListDto) {
    return this.cms.listEntry(query);
  }
  @Get('entries/:id') getEntry(@Param('id', ParseUUIDPipe) id: string) {
    return this.cms.getEntry(id);
  }
  @Post('entries') createEntry(
    @Body() dto: EntryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.createEntry(dto, actor);
  }
  @Patch('entries/:id') updateEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEntryDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.updateEntry(id, dto, actor);
  }
  @Patch('entries/:id/publish') publishEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.updateEntry(id, dto, actor);
  }
  @Delete('entries/:id') deleteEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.deleteEntry(id, actor);
  }

  @Get('notices') listNotice(@Query() query: ListDto) {
    return this.cms.listNotice(query);
  }
  @Get('notices/:id') getNotice(@Param('id', ParseUUIDPipe) id: string) {
    return this.cms.getNotice(id);
  }
  @Post('notices') createNotice(
    @Body() dto: NoticeDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.createNotice(dto, actor);
  }
  @Patch('notices/:id') updateNotice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateNoticeDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.updateNotice(id, dto, actor);
  }
  @Patch('notices/:id/publish') publishNotice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.updateNotice(id, dto, actor);
  }
  @Delete('notices/:id') deleteNotice(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.deleteNotice(id, actor);
  }

  @Get('events') listEvent(@Query() query: ListDto) {
    return this.cms.listEvent(query);
  }
  @Get('events/:id') getEvent(@Param('id', ParseUUIDPipe) id: string) {
    return this.cms.getEvent(id);
  }
  @Post('events') createEvent(
    @Body() dto: EventDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.createEvent(dto, actor);
  }
  @Patch('events/:id') updateEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEventDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.updateEvent(id, dto, actor);
  }
  @Patch('events/:id/publish') publishEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.updateEvent(id, dto, actor);
  }
  @Delete('events/:id') deleteEvent(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.deleteEvent(id, actor);
  }

  @Get('gallery') listAlbum(@Query() query: ListDto) {
    return this.cms.listAlbum(query);
  }
  @Get('gallery/:id') getAlbum(@Param('id', ParseUUIDPipe) id: string) {
    return this.cms.getAlbum(id);
  }
  @Post('gallery') createAlbum(
    @Body() dto: AlbumDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.createAlbum(dto, actor);
  }
  @Patch('gallery/:id') updateAlbum(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAlbumDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.updateAlbum(id, dto, actor);
  }
  @Patch('gallery/:id/publish') publishAlbum(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.updateAlbum(id, dto, actor);
  }
  @Delete('gallery/:id') deleteAlbum(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.deleteAlbum(id, actor);
  }

  @Get('careers') listCareer(@Query() query: ListDto) {
    return this.cms.listCareer(query);
  }
  @Get('careers/:id') getCareer(@Param('id', ParseUUIDPipe) id: string) {
    return this.cms.getCareer(id);
  }
  @Post('careers') createCareer(
    @Body() dto: CareerDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.createCareer(dto, actor);
  }
  @Patch('careers/:id') updateCareer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCareerDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.updateCareer(id, dto, actor);
  }
  @Patch('careers/:id/publish') publishCareer(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublishDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.updateCareer(id, dto, actor);
  }
  @Delete('careers/:id') deleteCareer(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.deleteCareer(id, actor);
  }

  @Post('gallery/:id/photos') addPhotos(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PhotosDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.addPhotos(id, dto.photos, actor);
  }
  @Patch('gallery/:id/photos/reorder') reorderPhotos(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PhotoIdsDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.reorderPhotos(id, dto.photoIds, actor);
  }
  @Delete('gallery/:id/photos') deletePhotos(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PhotoIdsDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.removePhotos(id, dto.photoIds, actor);
  }
  @Get('job-applications') listJobApplication(@Query() query: ListDto) {
    return this.cms.listJobApplication(query);
  }
  @Get('job-applications/:id') getJobApplication(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cms.getJobApplication(id);
  }
  @Patch('job-applications/:id/status') statusJobApplication(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplicationStatusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.statusJobApplication(id, dto, actor);
  }
  @Get('contact-submissions') listContactSubmission(@Query() query: ListDto) {
    return this.cms.listContactSubmission(query);
  }
  @Get('contact-submissions/:id') getContactSubmission(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cms.getContactSubmission(id);
  }
  @Patch('contact-submissions/:id/status') statusContactSubmission(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: InquiryStatusDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.cms.statusContactSubmission(id, dto, actor);
  }
}
