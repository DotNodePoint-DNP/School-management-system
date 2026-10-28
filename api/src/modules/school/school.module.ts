import { Global, Module } from '@nestjs/common';
import { SchoolImagesService } from './school-images.service.js';
import { SchoolController } from './school.controller.js';
import { SchoolService } from './school.service.js';
import { SignaturesController } from './signatures.controller.js';
import { LetterheadController } from './letterhead.controller.js';
import { SignaturesService } from './signatures.service.js';
import { LetterheadService } from './letterhead.service.js';

@Global()
@Module({
  controllers: [SchoolController, SignaturesController, LetterheadController],
  providers: [
    SchoolService,
    SchoolImagesService,
    SignaturesService,
    LetterheadService,
  ],
  exports: [SchoolService, SchoolImagesService, LetterheadService],
})
export class SchoolModule {}
