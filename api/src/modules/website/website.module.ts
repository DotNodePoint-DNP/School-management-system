import { Module } from '@nestjs/common';
import { WebsiteController } from './website.controller.js';
import { WebsiteService } from './website.service.js';
import { WebsitePublicService } from './website-public.service.js';
import { WebsitePublicController } from './website-public.controller.js';
import { WebsiteAdminService } from './website-admin.service.js';
import { WebsiteAdminController } from './website-admin.controller.js';
import { WebsiteFilesController } from './website-files.controller.js';

@Module({
  controllers: [
    WebsiteController,
    WebsitePublicController,
    WebsiteAdminController,
    WebsiteFilesController,
  ],
  providers: [WebsiteService, WebsitePublicService, WebsiteAdminService],
})
export class WebsiteModule {}
