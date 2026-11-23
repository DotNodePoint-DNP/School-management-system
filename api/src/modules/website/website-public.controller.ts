import { Body, Controller, Get, Ip, Param, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator.js';
import { WebsitePublicService } from './website-public.service.js';
import {
  ApplicationDto,
  ContactDto,
  EntryQueryDto,
  EventQueryDto,
  NoticeQueryDto,
} from './dto/cms.dto.js';

@Public()
@Controller('public/website')
export class WebsitePublicController {
  constructor(private readonly site: WebsitePublicService) {}
  @Get('entries') entries(@Query() query: EntryQueryDto) {
    return this.site.entries(query.section);
  }
  @Get('notices') notices(@Query() query: NoticeQueryDto) {
    return this.site.notices(query);
  }
  @Get('notices/:slug') notice(@Param('slug') slug: string) {
    return this.site.notice(slug);
  }
  @Get('events') events(@Query() query: EventQueryDto) {
    return this.site.events(query.filter);
  }
  @Get('events/:slug') event(@Param('slug') slug: string) {
    return this.site.event(slug);
  }
  @Get('gallery') albums() {
    return this.site.albums();
  }
  @Get('gallery/:slug') album(@Param('slug') slug: string) {
    return this.site.album(slug);
  }
  @Get('careers') careers() {
    return this.site.careers();
  }
  @Get('careers/:slug') career(@Param('slug') slug: string) {
    return this.site.career(slug);
  }
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('careers/:slug/apply')
  apply(@Param('slug') slug: string, @Body() dto: ApplicationDto) {
    return this.site.apply(slug, dto);
  }
  @Throttle({ default: { limit: 5, ttl: 60000 } }) @Post('contact') contact(
    @Body() dto: ContactDto,
    @Ip() ip: string,
  ) {
    return this.site.contact(dto, ip ?? null);
  }
}
