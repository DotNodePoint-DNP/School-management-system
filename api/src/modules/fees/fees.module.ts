import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { BillingPeriodsService } from './billing-periods.service.js';
import { BillingController } from './billing.controller.js';
import { FeeHeadsController } from './fee-heads.controller.js';
import { FeeHeadsService } from './fee-heads.service.js';
import { FeeStructuresService } from './fee-structures.service.js';
import { FiscalYearsController } from './fiscal-years.controller.js';
import { FiscalYearsService } from './fiscal-years.service.js';

@Module({
  imports: [AcademicYearsModule, ClassesModule],
  controllers: [FiscalYearsController, FeeHeadsController, BillingController],
  providers: [
    FiscalYearsService,
    FeeHeadsService,
    BillingPeriodsService,
    FeeStructuresService,
  ],
  exports: [
    FiscalYearsService,
    FeeHeadsService,
    BillingPeriodsService,
    FeeStructuresService,
  ],
})
export class FeesModule {}
