import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditService } from '../audit-logs/audit.service.js';
import { StorageService } from '../../infra/storage/storage.service.js';
import { adToBsString, bsToIso, todayIso } from '../../common/utils/bs-date.js';
import { displayName } from '../../common/utils/person.js';
import { mapPool } from '../../common/utils/pool.js';
import { reserveSequence } from '../../common/utils/sequence.js';
import type {
  TemplateDocumentKind,
  TemplatePrintEnvelope,
} from './document-contract.js';
import type { AuthUser } from '../auth/auth.types.js';
import { normalizeImage } from '../school/school-images.service.js';
import { PrintAssemblyService } from './print-assembly.service.js';
import {
  dimensions,
  validateLayout,
  validateWording,
  issueFieldLabels,
  type Layout,
  type PrepareDocuments,
  type IssueDocuments,
  type SaveTemplate,
} from './dto/template.dto.js';

const json = (v: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v));
const digest = (v: unknown) =>
  createHash('sha256').update(JSON.stringify(v)).digest('hex');
const imageUri = (data: Uint8Array) =>
  'data:image/png;base64,' + Buffer.from(data).toString('base64');
@Injectable()
export class TemplateService {
  constructor(
    private db: PrismaService,
    private assembly: PrintAssemblyService,
    private storage: StorageService,
    private audit: AuditService,
  ) {}

  list() {
    return this.db.documentTemplate.findMany({
      orderBy: { title: 'asc' },
      include: {
        versions: {
          orderBy: { revision: 'desc' },
          select: { id: true, title: true, revision: true },
        },
      },
    });
  }
  async versions() {
    const versions = await this.db.documentVersion.findMany({
      orderBy: [{ title: 'asc' }, { revision: 'desc' }],
      select: {
        id: true,
        title: true,
        revision: true,
        template: { select: { kind: true } },
        layout: true,
        templateId: true,
      },
    });
    return versions.map(({ layout: raw, ...v }) => {
      const layout = raw as unknown as Layout;
      const issueFields = Object.entries(issueFieldLabels).flatMap(
        ([key, fallback]) => {
          const block = layout.blocks.find(
            (b) => b.type === 'text' && b.text.includes('{{' + key + '}}'),
          );
          return block ? [{ key, label: block.label ?? fallback }] : [];
        },
      );
      return {
        ...v,
        issueFields,
        letter: layout.letter,
        signatorySlot: layout.signatorySlot,
      };
    });
  }
  async artwork(file?: Express.Multer.File) {
    const { data } = await normalizeImage(file?.buffer, {
      maxBytes: 4 * 1024 * 1024,
      maxWidth: 2400,
      maxHeight: 2400,
      minSide: 32,
    });
    return this.db.documentArtwork.create({
      data: { image: new Uint8Array(data) },
      select: { id: true },
    });
  }
  async art(id: string) {
    const row = await this.db.documentArtwork.findUniqueOrThrow({
      where: { id },
    });
    return imageUri(row.image);
  }
  async save(dto: SaveTemplate, actor: AuthUser, id?: string) {
    validateLayout(dto.kind, dto.layout);
    const ids = [
      ...new Set(
        [dto.layout.frontArt, dto.layout.backArt].filter(
          (v): v is string => !!v,
        ),
      ),
    ];
    if (
      (await this.db.documentArtwork.count({ where: { id: { in: ids } } })) !==
      ids.length
    )
      throw new BadRequestException('Unknown artwork');
    return this.db.$transaction(async (tx) => {
      const data = { title: dto.title.trim(), draft: json(dto.layout) };
      if (id) {
        if (
          !dto.revision ||
          !(
            await tx.documentTemplate.updateMany({
              where: { id, kind: dto.kind, revision: dto.revision },
              data: { ...data, revision: { increment: 1 } },
            })
          ).count
        )
          throw new ConflictException(
            'The draft has changed. Reload before saving.',
          );
      }
      const row = id
        ? await tx.documentTemplate.findUniqueOrThrow({ where: { id } })
        : await tx.documentTemplate.create({
            data: { ...data, kind: dto.kind },
          });
      await this.audit.recordIn(tx, {
        actor,
        action: 'document.saved',
        entityId: row.id,
        entityType: 'document_template',
      });
      return row;
    });
  }
  async publish(id: string, revision: number, actor: AuthUser) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM document_templates WHERE id=${id}::uuid FOR UPDATE`;
      const row = await tx.documentTemplate.findUniqueOrThrow({
        where: { id },
      });
      if (row.revision !== revision)
        throw new ConflictException('Reload the latest saved draft');
      validateLayout(row.kind, row.draft as unknown as Layout, true);
      const version = await tx.documentVersion.upsert({
        where: { templateId_revision: { templateId: id, revision } },
        create: {
          templateId: id,
          title: row.title,
          revision,
          layout: json(row.draft),
        },
        update: {},
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'document.published',
        entityId: version.id,
        entityType: 'document_version',
      });
      return version;
    });
  }
  async options() {
    const [years, sections] = await Promise.all([
      this.db.academicYear.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'desc' },
      }),
      this.db.section.findMany({
        select: {
          id: true,
          name: true,
          schoolClass: { select: { name: true } },
        },
        orderBy: [{ schoolClass: { name: 'asc' } }, { name: 'asc' }],
      }),
    ]);
    const today = new Date(todayIso() + 'T00:00:00Z');
    const signatories = await this.db.signatory.findMany({
      where: {
        validFrom: { lte: today },
        OR: [{ validTo: null }, { validTo: { gte: today } }],
      },
      select: { slot: true, fullNameEn: true },
      orderBy: { slot: 'asc' },
    });
    return { years, sections, signatories };
  }
  async roster(academicYearId: string, sectionId: string) {
    const rows = await this.db.enrollment.findMany({
      where: { academicYearId, sectionId },
      include: { student: true },
      orderBy: [{ rollNo: 'asc' }, { id: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      name: displayName(r.student),
      admissionNo: r.student.admissionNo,
      status: r.status,
      roll: r.rollNo,
    }));
  }
  async prepare(dto: PrepareDocuments, actor: AuthUser) {
    if (dto.signed && !actor.permissions.includes('documents:print-signed'))
      throw new ForbiddenException('Signed printing permission required');
    const v = await this.db.documentVersion.findUniqueOrThrow({
      where: { id: dto.versionId },
      include: { template: { select: { kind: true } } },
    });
    const kind = v.template.kind as TemplateDocumentKind;
    const layout = v.layout as unknown as Layout;
    const letter = dto.letter;
    if (kind === 'OFFICIAL_LETTER') {
      if (!letter || dto.enrollmentIds.length > 1)
        throw new BadRequestException(
          'Enter a recipient, subject and message. Select at most one student.',
        );
      validateWording(letter.subject);
      validateWording(letter.body);
    } else if (!dto.enrollmentIds.length || letter)
      throw new BadRequestException('Select students for this document');
    if (dto.replacesId) {
      const original = await this.db.documentIssue.findUniqueOrThrow({
        where: { id: dto.replacesId },
        include: {
          replacedBy: { select: { id: true } },
          batch: { include: { version: { select: { templateId: true } } } },
        },
      });
      if (
        original.replacedBy ||
        dto.enrollmentIds.length > 1 ||
        original.enrollmentId !== (dto.enrollmentIds[0] ?? null) ||
        !dto.reason?.trim() ||
        original.batch.version.templateId !== v.templateId
      )
        throw new BadRequestException(
          'Select the original enrollment, a version of the same template, and give a correction reason',
        );
    }
    const leavingDateBs = dto.leavingDateBs?.replace(/[०-९]/g, (d) =>
      String('०१२३४५६७८९'.indexOf(d)),
    );
    if (leavingDateBs) bsToIso(leavingDateBs, 'Leaving date');
    const issuedOn = todayIso();
    const envelope = await this.assembly.envelope({
      issuedOn,
      forceLine: !dto.signed,
      slots: [letter?.signatorySlot ?? layout.signatorySlot ?? 'PRINCIPAL'],
    });
    const principal = envelope.signatories[0];
    if (letter && dto.signed && !principal?.assetKey)
      throw new BadRequestException(
        'The selected signer has no digital signature available. Choose another signer or use a signature line.',
      );
    const assets: Record<string, string> = {};
    for (const key of ['logo', 'seal'] as const)
      if (
        (letter || layout.blocks.some((b) => b.type === key)) &&
        envelope.assets[key]
      )
        assets[key] = envelope.assets[key];
    if (
      principal?.assetKey &&
      (letter || layout.blocks.some((b) => b.type === 'signature'))
    )
      assets.signature = envelope.assets[principal.assetKey]!;
    for (const side of ['frontArt', 'backArt'] as const)
      if (layout[side]) assets[side] = await this.art(layout[side]);
    const needsPhoto = layout.blocks.some((b) => b.type === 'photo');
    const rows = await this.db.enrollment.findMany({
      where: { id: { in: dto.enrollmentIds } },
      include: {
        academicYear: true,
        section: { include: { schoolClass: true } },
        student: {
          include: {
            documents: {
              where: { type: 'PROFILE_PHOTO' },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: needsPhoto ? 1 : 0,
              select: { storageKey: true },
            },
          },
        },
      },
    });
    const photos = new Map(
      await mapPool(rows, 4, async (row) => {
        const key = row.student.documents[0]?.storageKey;
        const bytes = key && (await this.storage.get(key));
        const thumbnail = bytes
          ? await sharp(bytes)
              .resize(320, 400, { fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality: 80 })
              .toBuffer()
          : null;
        return [
          row.id,
          thumbnail
            ? 'data:image/jpeg;base64,' + thumbnail.toString('base64')
            : null,
        ] as const;
      }),
    );
    const map = new Map(rows.map((r) => [r.id, r]));
    const documents: {
      enrollmentId: string | null;
      values: Record<string, string>;
      photo: string | null;
    }[] = [];
    const skipped: {
      enrollmentId: string;
      admissionNo: string | null;
      reason: string;
    }[] = [];
    for (const id of dto.enrollmentIds.length ? dto.enrollmentIds : [null]) {
      const r = id ? map.get(id) : undefined;
      if (id && !r) {
        skipped.push({
          enrollmentId: id,
          admissionNo: null,
          reason: 'Enrollment unavailable',
        });
        continue;
      }
      const s = r?.student;
      const dob = s?.dateOfBirth.toISOString().slice(0, 10) ?? '';
      const values: Record<string, string> = {
        name: s ? displayName(s) : '',
        nameNp: s?.fullNameNp ?? '',
        admissionNo: s?.admissionNo ?? '',
        class: r?.section.schoolClass.name ?? '',
        section: r?.section.name ?? '',
        roll: String(r?.rollNo ?? ''),
        year: r?.academicYear.name ?? '',
        schoolEn: envelope.school.nameEn,
        schoolNp: envelope.school.nameNp ?? '',
        addressEn: envelope.school.addressEn ?? '',
        addressNp: envelope.school.addressNp ?? '',
        dobAd: dob,
        dobBs: adToBsString(dob) ?? '',
        issueAd: issuedOn,
        issueBs: envelope.issuedOn.bs ?? '',
        serial:
          layout.prefix +
          '-' +
          (layout.serialYear === 'BS' ? envelope.issuedOn.bs : issuedOn)?.slice(
            0,
            4,
          ) +
          '-00000',
        office: dto.office?.trim() ?? '',
        leavingDateBs: leavingDateBs ?? '',
        destination: dto.destination?.trim() ?? '',
        signer: principal?.nameEn ?? '',
        signerNp: principal?.nameNp ?? '',
        designation: principal?.designationEn ?? '',
        designationNp: principal?.designationNp ?? '',
        phone: envelope.school.phones.map((p) => p.number).join(', '),
        identifiers: envelope.school.identifiers
          .map((s) => s.labelEn + ' ' + s.value)
          .join(' · '),
      };
      if (layout.nepaliDigits)
        for (const key of [
          'roll',
          'dobAd',
          'dobBs',
          'issueAd',
          'issueBs',
          'leavingDateBs',
        ])
          values[key] = values[key]!.replace(
            /\d/g,
            (d) => '०१२३४५६७८९'[Number(d)]!,
          );
      const photo = id ? (photos.get(id) ?? null) : null;
      const missing = new Set<string>();
      for (const b of layout.blocks.filter((b) => b.required)) {
        if (b.type === 'text')
          for (const m of b.text.matchAll(/\{\{(\w+)\}\}/g)) {
            if (!values[m[1]!]) missing.add(m[1]!);
          }
        if (b.type === 'photo' && !photo) missing.add('photo');
        if (b.type === 'signature' && !principal)
          missing.add(layout.signatorySlot ?? 'PRINCIPAL');
        if ((b.type === 'logo' || b.type === 'seal') && !assets[b.type])
          missing.add(b.type);
      }
      if (letter) {
        for (const text of [letter.subject, letter.body])
          for (const match of text.matchAll(/\{\{(\w+)\}\}/g)) {
            if (!values[match[1]!]) missing.add(match[1]!);
          }
        Object.assign(values, {
          recipient: letter.recipient.trim(),
          signatorySlot:
            letter.signatorySlot ?? layout.signatorySlot ?? 'PRINCIPAL',
          subject: letter.subject.trim(),
          body: letter.body.trim(),
        });
        if (missing.size)
          throw new BadRequestException(
            'Missing letter fields: ' + [...missing].join(', '),
          );
      }
      if (missing.size && id)
        skipped.push({
          enrollmentId: id,
          admissionNo: s?.admissionNo ?? '',
          reason: 'Missing ' + [...missing].join(', '),
        });
      else documents.push({ enrollmentId: id, values, photo });
    }
    const header: TemplatePrintEnvelope = {
      ...envelope,
      assets,
      schemaVersion: 2,
      kind,
      paper: dimensions(kind, layout.orientation),
      templateTitle: v.title,
      versionId: v.id,
      signatories: envelope.signatories.map((s) => ({
        ...s,
        assetKey: assets.signature ? 'signature' : null,
      })),
    };
    const batch = { ...header, layout, documents, skipped };
    return { ...batch, proof: digest(batch) };
  }
  async issue(dto: IssueDocuments, actor: AuthUser) {
    const fingerprint = digest([
      actor.id,
      dto.versionId,
      dto.enrollmentIds,
      dto.signed,
      dto.office ?? '',
      ...(dto.leavingDateBs || dto.destination
        ? [dto.leavingDateBs, dto.destination]
        : []),
      ...(dto.letter
        ? [
            dto.letter.recipient,
            dto.letter.subject,
            dto.letter.body,
            dto.letter.signatorySlot,
          ]
        : []),
      dto.proof,
      dto.replacesId ?? '',
      dto.reason ?? '',
    ]);
    const existing = await this.db.documentBatch.findUnique({
      where: { id: dto.requestId },
    });
    if (existing) {
      if (existing.digest !== fingerprint)
        throw new ConflictException('Request ID already used');
      return this.copy(dto.requestId, actor);
    }
    const batch = await this.prepare(dto, actor);
    if (batch.proof !== dto.proof)
      throw new ConflictException('Data changed. Preview the selection again.');
    if (!batch.documents.length)
      throw new BadRequestException('No records ready to issue');
    const year = (
      batch.layout.serialYear === 'BS' ? batch.issuedOn.bs : batch.issuedOn.ad
    )?.slice(0, 4);
    if (!year) throw new BadRequestException('Issue year unavailable');
    const prefix = batch.layout.prefix + '-' + year;
    const { documents, ...header } = batch;
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${dto.requestId},0))::text`;
      const prior = await tx.documentBatch.findUnique({
        where: { id: dto.requestId },
      });
      if (prior) {
        if (prior.digest !== fingerprint)
          throw new ConflictException('Request ID already used');
        return;
      }
      const start = await reserveSequence(
        tx,
        'documents:' + prefix,
        documents.length,
      );
      await tx.documentBatch.create({
        data: {
          id: dto.requestId,
          actorId: actor.id,
          versionId: dto.versionId,
          digest: fingerprint,
          envelope: json(header),
        },
      });
      await tx.documentIssue.createMany({
        data: documents.map((doc, i) => {
          const serial = prefix + '-' + String(start + i).padStart(5, '0');
          return {
            batchId: dto.requestId,
            enrollmentId: doc.enrollmentId,
            serial,
            name: doc.values.recipient || doc.values.name!,
            admissionNo: doc.values.admissionNo!,
            snapshot: json({ ...doc, values: { ...doc.values, serial } }),
            replacesId: dto.replacesId,
            reason: dto.reason,
          };
        }),
      });
      await this.audit.recordIn(tx, {
        actor,
        action: 'document.issued',
        entityType: 'document_batch',
        entityId: dto.requestId,
        details: { count: documents.length, versionId: dto.versionId },
      });
    });
    return this.copy(dto.requestId, actor);
  }
  register(search: string) {
    if (typeof search !== 'string' || search.length > 200)
      throw new BadRequestException('Search must be at most 200 characters');
    const contains = { contains: search.trim(), mode: 'insensitive' as const };
    return this.db.documentIssue.findMany({
      where: {
        OR: [
          { serial: contains },
          { name: contains },
          { admissionNo: contains },
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { serial: 'asc' }],
      take: 100,
      select: {
        id: true,
        name: true,
        serial: true,
        enrollmentId: true,
        admissionNo: true,
        createdAt: true,
        reason: true,
        replacesId: true,
        replacedBy: { select: { serial: true } },
        batch: {
          select: { versionId: true, version: { select: { title: true } } },
        },
      },
    });
  }
  async copy(batchId: string, actor: AuthUser, issueId?: string) {
    const batch = await this.db.documentBatch.findUniqueOrThrow({
      where: { id: batchId },
      include: {
        issues: { where: { id: issueId }, orderBy: { serial: 'asc' } },
      },
    });
    const header = batch.envelope as Record<string, Prisma.JsonValue>;
    if (
      (header.assets as Record<string, string>).signature &&
      !actor.permissions.includes('documents:print-signed')
    )
      throw new ForbiddenException(
        'Signed printing permission required for this issued copy',
      );
    return {
      ...header,
      ...(issueId ? { skipped: [] } : {}),
      documents: batch.issues
        .sort((a, b) =>
          a.serial.localeCompare(b.serial, 'en', { numeric: true }),
        )
        .map((r) => r.snapshot),
    };
  }
  async reprint(id: string, actor: AuthUser) {
    const issue = await this.db.documentIssue.findUnique({
      where: { id },
      select: { batchId: true },
    });
    if (!issue) throw new NotFoundException('Issued document unavailable');
    const result = await this.copy(issue.batchId, actor, id);
    await this.audit.record({
      actor,
      action: 'document.reprinted',
      entityType: 'document_issue',
      entityId: id,
    });
    return result;
  }
}
