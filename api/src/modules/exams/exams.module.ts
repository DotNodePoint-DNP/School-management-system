import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { ExamsController } from './exams.controller.js';
import { ExamsService } from './exams.service.js';
import { GradeScalesController } from './grade-scales.controller.js';
import { GradeScalesService } from './grade-scales.service.js';
import { ResultPoliciesController } from './result-policies.controller.js';
import { ResultPoliciesService } from './result-policies.service.js';
import { MarksController } from './marks.controller.js';
import { ExamWorkflowController } from './exam-workflow.controller.js';
import { MarksService } from './marks.service.js';
import { MarksAccessService } from './marks-access.service.js';
import { ExamWorkflowService } from './exam-workflow.service.js';
import { ResultsController } from './results.controller.js';
import { ResultsService } from './results.service.js';

@Module({
  imports: [AcademicYearsModule, ClassesModule],
  controllers: [
    GradeScalesController,
    ExamsController,
    ResultPoliciesController,
    MarksController,
    ExamWorkflowController,
    ResultsController
  ],
  providers: [
    GradeScalesService,
    ExamsService,
    ResultPoliciesService,
    MarksService,
    MarksAccessService,
    ExamWorkflowService,
    ResultsService
  ],
  exports: [
    GradeScalesService,
    ExamsService,
    ResultPoliciesService,
    MarksService,
    ExamWorkflowService,
    ResultsService
  ],
})
export class ExamsModule {}
