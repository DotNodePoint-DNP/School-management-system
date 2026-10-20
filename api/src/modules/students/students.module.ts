import { Module } from '@nestjs/common';
import { GuardiansModule } from '../guardians/guardians.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { StudentAccessService } from './student-access.service.js';
import { StudentsController } from './students.controller.js';
import { StudentsService } from './students.service.js';

@Module({
  imports: [GuardiansModule, StaffModule],
  controllers: [StudentsController],
  providers: [StudentsService, StudentAccessService],
  exports: [StudentsService, StudentAccessService],
})
export class StudentsModule {}
