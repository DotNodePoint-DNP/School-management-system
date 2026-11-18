import { Injectable } from '@nestjs/common';
import { todayIso } from '../../common/utils/bs-date.js';
import type { AuthUser } from '../auth/auth.types.js';
import type {
  PrintBatch,
  PrintEnvelope,
} from '../documents/document-contract.js';
import { PrintAssemblyService } from '../documents/print-assembly.service.js';
import type { ReportCardData } from '../documents/report-card.service.js';
import type {
  PortalPrintInvoiceDto,
  PortalPrintReceiptDto,
  PortalPrintReportCardDto,
  PortalPrintStatementDto,
} from './dto/portal-fees.dto.js';
import {
  PortalFeesService,
  type ParentReceipt,
} from './portal-fees.service.js';
import { PortalResultsService } from './portal-results.service.js';

type Invoice = Awaited<ReturnType<PortalFeesService['invoiceDetail']>>;
type Statement = Awaited<ReturnType<PortalFeesService['statement']>>;

/**
 * Printable copies for parents (the browser's Print or Save as PDF). They are built from the same checked data as the portal
 * screens, have blank signature lines only, are marked as parent copies, and never touch the office's original/duplicate counts.
 */
@Injectable()
export class PortalPrintService {
  constructor(
    private readonly assembly: PrintAssemblyService,
    private readonly results: PortalResultsService,
    private readonly fees: PortalFeesService,
  ) {}

  async reportCard(
    actor: AuthUser,
    dto: PortalPrintReportCardDto,
  ): Promise<PrintBatch<'REPORT_CARD', ReportCardData>> {
    const doc = await this.results.reportCard(actor, dto.studentId, {
      enrollmentId: dto.enrollmentId,
      examId: dto.examId,
    });
    const envelope = await this.envelope(todayIso(), {
      academicYearId: doc.academicYear.id,
      sectionIds: [doc.section.id],
      slots: ['PRINCIPAL', 'EXAM_CONTROLLER'],
    });
    return { kind: 'REPORT_CARD', ...envelope, documents: [doc], skipped: [] };
  }

  async receipt(
    actor: AuthUser,
    dto: PortalPrintReceiptDto,
  ): Promise<PrintBatch<'RECEIPT', ParentReceipt>> {
    const doc = await this.fees.receiptFor(actor, dto.paymentId);
    return {
      kind: 'RECEIPT',
      ...(await this.envelope(doc.paidOn, { slots: ['ACCOUNTANT'] })),
      documents: [doc],
      skipped: [],
    };
  }

  async invoice(
    actor: AuthUser,
    dto: PortalPrintInvoiceDto,
  ): Promise<PrintBatch<'INVOICE', Invoice>> {
    const doc = await this.fees.invoiceDetail(actor, dto.invoiceId);
    return {
      kind: 'INVOICE',
      ...(await this.envelope(doc.issuedOn.ad, { slots: ['ACCOUNTANT'] })),
      documents: [doc],
      skipped: [],
    };
  }

  async statement(
    actor: AuthUser,
    dto: PortalPrintStatementDto,
  ): Promise<PrintBatch<'STATEMENT', Statement>> {
    const doc = await this.fees.statement(actor, dto.studentId, {
      from: dto.from,
      to: dto.to,
    });
    return {
      kind: 'STATEMENT',
      ...(await this.envelope(todayIso(), { slots: ['ACCOUNTANT'] })),
      documents: [doc],
      skipped: [],
    };
  }

  private async envelope(
    issuedOn: string,
    opts: { academicYearId?: string; sectionIds?: string[]; slots: string[] },
  ): Promise<PrintEnvelope> {
    const envelope = await this.assembly.envelope({
      ...opts,
      issuedOn,
      forceLine: true,
    }); // never a digital signature on a parent copy
    return { ...envelope, variant: 'PARENT_COPY' };
  }
}
