import { Module } from '@nestjs/common';
import { AcademicYearsModule } from '../academic-years/academic-years.module.js';
import { ClassesModule } from '../classes/classes.module.js';
import { UsersModule } from '../users/users.module.js';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';
import { TeachingController } from './teaching.controller.js';
import { TeachingService } from './teaching.service.js';

@Module({
  imports: [UsersModule, AcademicYearsModule, ClassesModule],
  controllers: [StaffController, TeachingController],
  providers: [StaffService, TeachingService],
  exports: [StaffService, TeachingService],
})
export class StaffModule {}
