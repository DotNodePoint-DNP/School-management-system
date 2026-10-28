import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years.module.js';
import { AttendanceAccessService } from './attendance-access.service.js';
import { AttendanceReportsService } from './attendance-reports.service.js';
import { AttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';
import { CalendarController } from './calendar.controller.js';
import { CalendarService } from './calendar.service.js';
import { DatesController } from './dates.controller.js';
import { AttendanceSummaryService } from './attendance-summary.service.js';

@Module({
  imports: [AcademicYearsModule],
  controllers: [CalendarController, AttendanceController, DatesController],
  providers: [
    CalendarService,
    AttendanceAccessService,
    AttendanceService,
    AttendanceReportsService,
    AttendanceSummaryService,
  ],
  exports: [
    AttendanceService,
    AttendanceAccessService,
    AttendanceSummaryService,
  ],
})
export class AttendanceModule {}
