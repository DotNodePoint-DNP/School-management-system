import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years.module.js';
import { StudentsModule } from '../students/students.module.js';
import { PromotionApplyController } from './promotion-apply.controller.js';
import { PromotionApplyService } from './promotion-apply.service.js';
import { PromotionController } from './promotion.controller.js';
import { PromotionService } from './promotion.service.js';

@Module({
  imports: [AcademicYearsModule, StudentsModule],
  controllers: [PromotionController, PromotionApplyController],
  providers: [PromotionService, PromotionApplyService],
  exports: [PromotionService, PromotionApplyService],
})
export class PromotionModule {}
