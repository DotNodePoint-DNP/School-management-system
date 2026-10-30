import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { ExamsModule } from '../exams/exams.module.js';
import { PrintController } from './print.controller.js';
import { PrintAssemblyService } from './print-assembly.service.js';
import { ReportCardService } from './report-card.service.js';

@Module({
  imports: [ExamsModule, AttendanceModule],
  controllers: [PrintController],
  providers: [PrintAssemblyService, ReportCardService],
})
export class DocumentsModule {}
