import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { GuardiansModule } from '../guardians/guardians.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { EnrollmentsController } from './enrollments.controller.js';
import { EnrollmentsService } from './enrollments.service.js';
import { StudentAccessService } from './student-access.service.js';
import { StudentLifecycleService } from './student-lifecycle.service.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';

@Module({
  imports: [GuardiansModule, StaffModule, AcademicYearsModule, ClassesModule],
  controllers: [StudentsController, EnrollmentsController],
  providers: [
    StudentsService,
    StudentAccessService,
    EnrollmentsService,
    StudentLifecycleService,
  ],
  exports: [StudentsService, StudentAccessService, EnrollmentsService],
})
export class StudentsModule {}
