import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years.module.js';
import { PromotionController } from './promotion.controller.js';
import { PromotionService } from './promotion.service.js';

@Module({
  imports: [AcademicYearsModule],
  controllers: [PromotionController],
  providers: [PromotionService],
  exports: [PromotionService],
})
export class PromotionModule {}
