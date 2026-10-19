import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { CurriculumController } from './curriculum.controller.js';
import { CurriculumService } from './curriculum.service.js';
import { SubjectsController } from './subjects.controller.js';
import { SubjectsService } from './subjects.service.js';

@Module({
  imports: [AcademicYearsModule, ClassesModule],
  controllers: [SubjectsController, CurriculumController],
  providers: [SubjectsService, CurriculumService],
  exports: [SubjectsService],
})
export class SubjectsModule {}
