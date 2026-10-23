import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { ExamsController } from './exams.controller.js';
import { ExamsService } from './exams.service.js';
import { GradeScalesController } from './grade-scales.controller.js';
import { GradeScalesService } from './grade-scales.service.js';
import { ResultPoliciesController } from './result-policies.controller.js';
import { ResultPoliciesService } from './result-policies.service.js';

@Module({
  imports: [AcademicYearsModule, ClassesModule],
  controllers: [
    GradeScalesController,
    ExamsController,
    ResultPoliciesController,
  ],
  providers: [GradeScalesService, ExamsService, ResultPoliciesService],
  exports: [GradeScalesService, ExamsService, ResultPoliciesService],
})
export class ExamsModule {}
