import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { ExamsModule } from '../exams/exams.module.js';
import { PortalAccessService } from './portal-access.service.js';
import { PortalResultsService } from './portal-results.service.js';
import { PortalService } from './portal.service.js';
import { PortalController } from './portal.controller.js';

@Module({
  imports: [AttendanceModule, DocumentsModule, ExamsModule],
  controllers: [PortalController],
  providers: [PortalAccessService, PortalService, PortalResultsService],
  exports: [PortalAccessService],
})
export class PortalModule {}
