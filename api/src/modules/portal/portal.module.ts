import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { ExamsModule } from '../exams/exams.module.js';
import { FeesModule } from '../fees/fees.module.js';
import { PortalAccessService } from './portal-access.service.js';
import { PortalFeesController } from './portal-fees.controller.js';
import { PortalFeesService } from './portal-fees.service.js';
import { PortalPrintService } from './portal-print.service.js';
import { PortalResultsService } from './portal-results.service.js';
import { PortalController } from './portal.controller.js';
import { PortalService } from './portal.service.js';

@Module({
  imports: [AttendanceModule, DocumentsModule, ExamsModule, FeesModule],
  controllers: [PortalController, PortalFeesController],
  providers: [
    PortalAccessService,
    PortalService,
    PortalResultsService,
    PortalFeesService,
    PortalPrintService,
  ],
  exports: [PortalAccessService],
})
export class PortalModule {}
