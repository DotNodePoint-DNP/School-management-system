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
import { StudentFeesController } from './student-fees.controller.js';
import { ChargePlannerService } from './charge-planner.service.js';
import { DiscountsService } from './discounts.service.js';
import { FeeAssignmentsService } from './fee-assignments.service.js';
import { FeeEnrollmentLockService } from './fee-enrollment-lock.service.js';
import { FeeProfileService } from './fee-profile.service.js';
import { InvoicesController } from './invoices.controller.js';
import { InvoiceBalanceService } from './invoice-balance.service.js';
import { InvoiceGenerationService } from './invoice-generation.service.js';
import { InvoicesService } from './invoices.service.js';

@Module({
  imports: [AcademicYearsModule, ClassesModule],
  controllers: [
    FiscalYearsController,
    FeeHeadsController,
    BillingController,
    StudentFeesController,
    InvoicesController,
  ],
  providers: [
    FiscalYearsService,
    FeeHeadsService,
    BillingPeriodsService,
    FeeStructuresService,
    FeeEnrollmentLockService,
    FeeAssignmentsService,
    DiscountsService,
    ChargePlannerService,
    FeeProfileService,
    InvoiceBalanceService,
    InvoiceGenerationService,
    InvoicesService,
  ],
  exports: [
    FiscalYearsService,
    FeeHeadsService,
    BillingPeriodsService,
    FeeStructuresService,
    FeeEnrollmentLockService,
    FeeAssignmentsService,
    DiscountsService,
    ChargePlannerService,
    FeeProfileService,
    InvoiceBalanceService,
    InvoiceGenerationService,
    InvoicesService,
  ],
})
export class FeesModule {}
