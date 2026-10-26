import { Global, Module } from '@nestjs/common';
import { SchoolImagesService } from './school-images.service.js';
import { SchoolController } from './school.controller.js';
import { SchoolService } from './school.service.js';

@Global()
@Module({
  controllers: [SchoolController],
  providers: [SchoolService, SchoolImagesService],
  exports: [SchoolService, SchoolImagesService],
})
export class SchoolModule {}
