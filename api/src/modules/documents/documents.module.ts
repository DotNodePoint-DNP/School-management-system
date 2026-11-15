import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { ExamsModule } from '../exams/exams.module.js';
import { FeesModule } from '../fees/fees.module.js';
import { FeeDocumentsService } from './fee-documents.service.js';
import { FeePrintController } from './fee-print.controller.js';
import { PrintController } from './print.controller.js';
import { PrintAssemblyService } from './print-assembly.service.js';
import { ReportCardService } from './report-card.service.js';

@Module({
  imports: [ExamsModule, AttendanceModule, FeesModule],
  controllers: [PrintController, FeePrintController],
  providers: [PrintAssemblyService, ReportCardService, FeeDocumentsService],
})
export class DocumentsModule {}
