import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toPaginated } from '../../common/dto/pagination.dto.js';
import { AuditService } from '../audit-logs/audit.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import { allocateSlug } from './slug.js';
import type {
  EntryDto,
  NoticeDto,
  EventDto,
  AlbumDto,
  CareerDto,
  ListDto,
  PhotoDto,
  ApplicationStatusDto,
  InquiryStatusDto,
} from './dto/cms.dto.js';

type Tx = Prisma.TransactionClient;
const photos = {
  photos: {
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.GalleryAlbumInclude;

@Injectable()
export class WebsiteAdminService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}
  private async change<T extends { id: string }>(
    actor: AuthUser,
    entityType: string,
    operation: string,
    write: (tx: Tx) => Promise<T>,
  ) {
    return this.db.$transaction(async (tx) => {
      const result = await write(tx);
      await this.audit.recordIn(tx, {
        actor,
        action: 'website.saved',
        entityType,
        entityId: result.id,
        details: { operation },
      });
      return result;
    });
  }
  async listEntry(query: ListDto) {
    const [rows, count] = await this.db.$transaction([
      this.db.websiteEntry.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.websiteEntry.count(),
    ]);
    return toPaginated(rows, count, {
      page: query.page,
      pageSize: query.limit,
    });
  }
  getEntry(id: string) {
    return this.db.websiteEntry.findUniqueOrThrow({ where: { id } });
  }
  createEntry(dto: EntryDto, actor: AuthUser) {
    return this.change(actor, 'WebsiteEntry', 'create', async (tx) => {
      const slug = await allocateSlug(tx, 'entries', dto.title, (prefix) =>
        tx.websiteEntry.findMany({
          where: { slug: { startsWith: prefix } },
          select: { slug: true },
        }),
      );

      return tx.websiteEntry.create({
        data: { ...this.websiteEntryData(dto), slug },
      });
    });
  }
  updateEntry(id: string, dto: Partial<EntryDto>, actor: AuthUser) {
    return this.change(actor, 'WebsiteEntry', 'update', async (tx) => {
      return tx.websiteEntry.update({
        where: { id },
        data: { ...this.websiteEntryData(dto) },
      });
    });
  }
  deleteEntry(id: string, actor: AuthUser) {
    return this.change(actor, 'WebsiteEntry', 'delete', (tx) =>
      tx.websiteEntry.delete({ where: { id }, select: { id: true } }),
    );
  }

  async listNotice(query: ListDto) {
    const [rows, count] = await this.db.$transaction([
      this.db.notice.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.notice.count(),
    ]);
    return toPaginated(rows, count, {
      page: query.page,
      pageSize: query.limit,
    });
  }
  getNotice(id: string) {
    return this.db.notice.findUniqueOrThrow({ where: { id } });
  }
  createNotice(dto: NoticeDto, actor: AuthUser) {
    return this.change(actor, 'Notice', 'create', async (tx) => {
      const slug = await allocateSlug(tx, 'notices', dto.title, (prefix) =>
        tx.notice.findMany({
          where: { slug: { startsWith: prefix } },
          select: { slug: true },
        }),
      );

      return tx.notice.create({
        data: { ...dto, slug, publishedAt: dto.published ? new Date() : null },
      });
    });
  }
  updateNotice(id: string, dto: Partial<NoticeDto>, actor: AuthUser) {
    return this.change(actor, 'Notice', 'update', async (tx) => {
      await tx.$executeRaw`SELECT id FROM notices WHERE id=${id}::uuid FOR UPDATE`;
      const current = await tx.notice.findUniqueOrThrow({
        where: { id },
        select: { published: true, publishedAt: true },
      });
      return tx.notice.update({
        where: { id },
        data: {
          ...dto,
          publishedAt:
            dto.published && !current.published
              ? new Date()
              : current.publishedAt,
        },
      });
    });
  }
  deleteNotice(id: string, actor: AuthUser) {
    return this.change(actor, 'Notice', 'delete', (tx) =>
      tx.notice.delete({ where: { id }, select: { id: true } }),
    );
  }

  async listEvent(query: ListDto) {
    const [rows, count] = await this.db.$transaction([
      this.db.websiteEvent.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.websiteEvent.count(),
    ]);
    return toPaginated(rows, count, {
      page: query.page,
      pageSize: query.limit,
    });
  }
  getEvent(id: string) {
    return this.db.websiteEvent.findUniqueOrThrow({ where: { id } });
  }
  createEvent(dto: EventDto, actor: AuthUser) {
    return this.change(actor, 'WebsiteEvent', 'create', async (tx) => {
      const slug = await allocateSlug(tx, 'events', dto.title, (prefix) =>
        tx.websiteEvent.findMany({
          where: { slug: { startsWith: prefix } },
          select: { slug: true },
        }),
      );
      validateInterval(
        new Date(dto.startsAt),
        dto.endsAt ? new Date(dto.endsAt) : null,
      );
      return tx.websiteEvent.create({
        data: { ...this.websiteEventData(dto), slug },
      });
    });
  }
  updateEvent(id: string, dto: Partial<EventDto>, actor: AuthUser) {
    return this.change(actor, 'WebsiteEvent', 'update', async (tx) => {
      await tx.$executeRaw`SELECT id FROM website_events WHERE id=${id}::uuid FOR UPDATE`;
      const current = await tx.websiteEvent.findUniqueOrThrow({
        where: { id },
      });
      validateInterval(
        dto.startsAt ? new Date(dto.startsAt) : current.startsAt,
        dto.endsAt === undefined
          ? current.endsAt
          : dto.endsAt
            ? new Date(dto.endsAt)
            : null,
      );

      return tx.websiteEvent.update({
        where: { id },
        data: { ...this.websiteEventData(dto) },
      });
    });
  }
  deleteEvent(id: string, actor: AuthUser) {
    return this.change(actor, 'WebsiteEvent', 'delete', (tx) =>
      tx.websiteEvent.delete({ where: { id }, select: { id: true } }),
    );
  }

  async listAlbum(query: ListDto) {
    const [rows, count] = await this.db.$transaction([
      this.db.galleryAlbum.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.galleryAlbum.count(),
    ]);
    return toPaginated(rows, count, {
      page: query.page,
      pageSize: query.limit,
    });
  }
  getAlbum(id: string) {
    return this.db.galleryAlbum.findUniqueOrThrow({
      where: { id },
      include: photos,
    });
  }
  createAlbum(dto: AlbumDto, actor: AuthUser) {
    return this.change(actor, 'GalleryAlbum', 'create', async (tx) => {
      const slug = await allocateSlug(tx, 'gallery', dto.title, (prefix) =>
        tx.galleryAlbum.findMany({
          where: { slug: { startsWith: prefix } },
          select: { slug: true },
        }),
      );

      return tx.galleryAlbum.create({
        data: { ...this.galleryAlbumData(dto), slug },
      });
    });
  }
  updateAlbum(id: string, dto: Partial<AlbumDto>, actor: AuthUser) {
    return this.change(actor, 'GalleryAlbum', 'update', async (tx) => {
      return tx.galleryAlbum.update({
        where: { id },
        data: { ...this.galleryAlbumData(dto) },
      });
    });
  }
  deleteAlbum(id: string, actor: AuthUser) {
    return this.change(actor, 'GalleryAlbum', 'delete', (tx) =>
      tx.galleryAlbum.delete({ where: { id }, select: { id: true } }),
    );
  }

  async listCareer(query: ListDto) {
    const [rows, count] = await this.db.$transaction([
      this.db.careerPosting.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.careerPosting.count(),
    ]);
    return toPaginated(rows, count, {
      page: query.page,
      pageSize: query.limit,
    });
  }
  getCareer(id: string) {
    return this.db.careerPosting.findUniqueOrThrow({ where: { id } });
  }
  createCareer(dto: CareerDto, actor: AuthUser) {
    return this.change(actor, 'CareerPosting', 'create', async (tx) => {
      const slug = await allocateSlug(tx, 'careers', dto.title, (prefix) =>
        tx.careerPosting.findMany({
          where: { slug: { startsWith: prefix } },
          select: { slug: true },
        }),
      );

      return tx.careerPosting.create({
        data: { ...this.careerPostingData(dto), slug },
      });
    });
  }
  updateCareer(id: string, dto: Partial<CareerDto>, actor: AuthUser) {
    return this.change(actor, 'CareerPosting', 'update', async (tx) => {
      return tx.careerPosting.update({
        where: { id },
        data: { ...this.careerPostingData(dto) },
      });
    });
  }
  deleteCareer(id: string, actor: AuthUser) {
    return this.change(actor, 'CareerPosting', 'delete', (tx) =>
      tx.careerPosting.delete({ where: { id }, select: { id: true } }),
    );
  }
  private websiteEntryData<T extends Partial<EntryDto>>(dto: T) {
    const { metadata, ...rest } = dto;
    return { ...rest, metadata: metadata === null ? Prisma.DbNull : metadata };
  }
  private websiteEventData<T extends Partial<EventDto>>(dto: T) {
    const { endsAt, ...rest } = dto;
    return {
      ...rest,
      endsAt: endsAt === null ? null : endsAt ? new Date(endsAt) : undefined,
    };
  }
  private galleryAlbumData<T extends Partial<AlbumDto>>(dto: T) {
    const { eventDate, ...rest } = dto;
    return {
      ...rest,
      eventDate:
        eventDate === null ? null : eventDate ? new Date(eventDate) : undefined,
    };
  }
  private careerPostingData<T extends Partial<CareerDto>>(dto: T) {
    const { deadline, ...rest } = dto;
    return {
      ...rest,
      deadline:
        deadline === null ? null : deadline ? new Date(deadline) : undefined,
    };
  }

  private async lockAlbum(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM gallery_albums WHERE id=${id}::uuid FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Album not found');
  }
  addPhotos(id: string, photos: PhotoDto[], actor: AuthUser) {
    return this.change(actor, 'GalleryAlbum', 'add photos', async (tx) => {
      await this.lockAlbum(tx, id);
      const last = await tx.galleryPhoto.aggregate({
        where: { albumId: id },
        _max: { sortOrder: true },
      });
      const offset = (last._max.sortOrder ?? -1) + 1;
      await tx.galleryPhoto.createMany({
        data: photos.map((photo, i) => ({
          ...photo,
          albumId: id,
          sortOrder: offset + i,
        })),
      });
      return tx.galleryAlbum.findUniqueOrThrow({
        where: { id },
        include: { photos: { orderBy: { sortOrder: 'asc' } } },
      });
    });
  }
  reorderPhotos(id: string, ids: string[], actor: AuthUser) {
    return this.change(actor, 'GalleryAlbum', 'reorder photos', async (tx) => {
      await this.lockAlbum(tx, id);
      const current = await tx.galleryPhoto.findMany({
        where: { albumId: id },
        select: { id: true },
      });
      const wanted = new Set(ids);
      if (
        current.length !== ids.length ||
        current.some((p) => !wanted.has(p.id))
      )
        throw new BadRequestException(
          'Provide every photo in this album exactly once',
        );
      await tx.$executeRaw`UPDATE gallery_photos AS p SET sort_order = ordering.position - 1
       FROM unnest(ARRAY[${Prisma.join(ids)}]::uuid[]) WITH ORDINALITY AS ordering(id,position)
       WHERE p.id=ordering.id AND p.album_id=${id}::uuid`;
      return { id };
    });
  }
  removePhotos(id: string, ids: string[], actor: AuthUser) {
    return this.change(actor, 'GalleryAlbum', 'delete photos', async (tx) => {
      await this.lockAlbum(tx, id);
      const result = await tx.galleryPhoto.deleteMany({
        where: { albumId: id, id: { in: ids } },
      });
      if (result.count !== ids.length)
        throw new NotFoundException('Photo not found in this album');
      return { id, deleted: result.count };
    });
  }
  async listJobApplication(query: ListDto) {
    const [rows, count] = await this.db.$transaction([
      this.db.jobApplication.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.jobApplication.count(),
    ]);
    return toPaginated(rows, count, {
      page: query.page,
      pageSize: query.limit,
    });
  }
  getJobApplication(id: string) {
    return this.db.jobApplication.findUniqueOrThrow({ where: { id } });
  }
  statusJobApplication(id: string, dto: ApplicationStatusDto, actor: AuthUser) {
    return this.change(actor, 'JobApplication', 'status: ' + dto.status, (tx) =>
      tx.jobApplication.update({ where: { id }, data: dto }),
    );
  }
  async listContactSubmission(query: ListDto) {
    const [rows, count] = await this.db.$transaction([
      this.db.contactSubmission.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.contactSubmission.count(),
    ]);
    return toPaginated(rows, count, {
      page: query.page,
      pageSize: query.limit,
    });
  }
  getContactSubmission(id: string) {
    return this.db.contactSubmission.findUniqueOrThrow({ where: { id } });
  }
  statusContactSubmission(id: string, dto: InquiryStatusDto, actor: AuthUser) {
    return this.change(
      actor,
      'ContactSubmission',
      'status: ' + dto.status,
      (tx) => tx.contactSubmission.update({ where: { id }, data: dto }),
    );
  }
}
function validateInterval(start: Date, end: Date | null) {
  if (end && end < start)
    throw new BadRequestException('Event end must be on or after its start');
}
