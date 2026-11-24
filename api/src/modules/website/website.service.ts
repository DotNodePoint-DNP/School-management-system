import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { WebsiteSection } from './legacy-section.js';
import { Prisma } from '../../generated/prisma/client.js';
import { allocateSlug } from './slug.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuditService } from '../audit-logs/audit.service.js';
import { SchoolImagesService } from '../school/school-images.service.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  PaginationQueryDto,
  toPaginated,
} from '../../common/dto/pagination.dto.js';
import type { WebsiteEntryDto } from './dto/website-entry.dto.js';

@Injectable()
export class WebsiteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly images: SchoolImagesService,
  ) {}

  async profile() {
    const profile = await this.prisma.schoolProfile.findUnique({
      where: { id: 1 },
      select: {
        nameEn: true,
        nameNp: true,
        taglineEn: true,
        district: true,
        localLevel: true,
        wardNo: true,
        tole: true,
        province: true,
        addressLineNp: true,
        logoFileId: true,
        email: true,
        establishedOn: true,
      },
    });
    if (!profile) return null;
    const { logoFileId, ...details } = profile;
    return { ...details, hasLogo: Boolean(logoFileId) };
  }

  async logo() {
    const profile = await this.prisma.schoolProfile.findUnique({
      where: { id: 1 },
      select: { logoFile: { select: { id: true, kind: true } } },
    });
    const logo = profile?.logoFile;
    const image =
      logo?.kind === 'LOGO' ? await this.images.read(logo.id) : null;
    if (!image) throw new NotFoundException('School logo unavailable');
    return image;
  }

  classes() {
    return this.prisma.schoolClass.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { name: true },
    });
  }

  async list(
    section: WebsiteSection,
    query: PaginationQueryDto,
    includeDrafts = false,
  ) {
    const filter = Prisma.sql`section=${section} ${includeDrafts ? Prisma.empty : Prisma.sql`AND published AND (expires_at IS NULL OR expires_at>now())`}`;
    const [entries, counts] = await this.prisma.$transaction([
      this.prisma.$queryRaw<
        LegacyRow[]
      >`SELECT id,title,body,image_url AS "imageUrl",image_alt AS "imageAlt",display_date AS "displayDate",created_at AS "createdAt",published FROM website_section_feed WHERE ${filter}
 ORDER BY created_at DESC,id DESC LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`,
      this.prisma.$queryRaw<
        { count: number }[]
      >`SELECT count(*)::int AS count FROM website_section_feed WHERE ${filter}`,
    ]);
    return toPaginated(entries, counts[0].count, query);
  }

  async save(dto: WebsiteEntryDto, actor: AuthUser, id?: string) {
    const { section, title, body, published } = dto;
    const imageUrl = dto.imageUrl ?? null,
      imageAlt = dto.imageAlt ?? null,
      displayDate = dto.displayDate ? new Date(dto.displayDate) : null;
    return this.prisma.$transaction(async (tx) => {
      if (id) {
        const [row] = await tx.$queryRaw<
          { section: WebsiteSection }[]
        >`SELECT section FROM website_section_feed WHERE id=${id}::uuid`;
        if (!row) throw new NotFoundException('Entry not found');
        const pages = ['home', 'about', 'academics', 'facilities'];
        if (
          row.section !== section &&
          !(pages.includes(row.section) && pages.includes(section))
        )
          throw new ConflictException(
            'Create a new record to change the content type',
          );
      }
      const base = { title, published, imageAlt };
      const slugFor = (
        resource: string,
        find: (prefix: string) => Promise<{ slug: string | null }[]>,
      ) => allocateSlug(tx, resource, title, find);
      let row: { id: string; createdAt: Date };
      switch (section) {
        case 'notices': {
          const data = {
            ...base,
            body,
            imageUrl,
            publishedAt: displayDate ?? (published ? new Date() : null),
          };
          row = id
            ? await tx.notice.update({ where: { id }, data })
            : await tx.notice.create({
                data: {
                  ...data,
                  slug: await slugFor('notices', (prefix) =>
                    tx.notice.findMany({
                      where: { slug: { startsWith: prefix } },
                      select: { slug: true },
                    }),
                  ),
                },
              });
          break;
        }
        case 'events': {
          const data = {
            ...base,
            description: body,
            coverImage: imageUrl,
            startsAt: displayDate ?? new Date(),
          };
          row = id
            ? await tx.websiteEvent.update({ where: { id }, data })
            : await tx.websiteEvent.create({
                data: {
                  ...data,
                  slug: await slugFor('events', (prefix) =>
                    tx.websiteEvent.findMany({
                      where: { slug: { startsWith: prefix } },
                      select: { slug: true },
                    }),
                  ),
                },
              });
          break;
        }
        case 'gallery': {
          const data = {
            ...base,
            description: body,
            coverImage: imageUrl,
            eventDate: displayDate,
          };
          row = id
            ? await tx.galleryAlbum.update({ where: { id }, data })
            : await tx.galleryAlbum.create({
                data: {
                  ...data,
                  slug: await slugFor('gallery', (prefix) =>
                    tx.galleryAlbum.findMany({
                      where: { slug: { startsWith: prefix } },
                      select: { slug: true },
                    }),
                  ),
                },
              });
          if (imageUrl)
            await tx.galleryPhoto.upsert({
              where: { id: row.id },
              update: { imageUrl, altText: imageAlt },
              create: {
                id: row.id,
                albumId: row.id,
                imageUrl,
                altText: imageAlt,
              },
            });
          break;
        }
        case 'careers': {
          const data = {
            ...base,
            description: body,
            imageUrl,
            deadline: displayDate,
          };
          row = id
            ? await tx.careerPosting.update({ where: { id }, data })
            : await tx.careerPosting.create({
                data: {
                  ...data,
                  slug: await slugFor('careers', (prefix) =>
                    tx.careerPosting.findMany({
                      where: { slug: { startsWith: prefix } },
                      select: { slug: true },
                    }),
                  ),
                },
              });
          break;
        }
        default: {
          const data = { ...base, section, body, imageUrl, displayDate };
          row = id
            ? await tx.websiteEntry.update({ where: { id }, data })
            : await tx.websiteEntry.create({
                data: {
                  ...data,
                  slug: await slugFor('entries', (prefix) =>
                    tx.websiteEntry.findMany({
                      where: { slug: { startsWith: prefix } },
                      select: { slug: true },
                    }),
                  ),
                },
              });
        }
      }
      await this.audit.recordIn(tx, {
        actor,
        action: 'website.saved',
        entityType: 'WebsiteEntry',
        entityId: row.id,
        details: { section, published },
      });
      return {
        id: row.id,
        section,
        title,
        body,
        published,
        imageUrl,
        imageAlt,
        displayDate,
        createdAt: row.createdAt,
      };
    });
  }
}
export interface LegacyRow {
  id: string;
  title: string;
  body: string;
  published: boolean;
  imageUrl: string | null;
  imageAlt: string | null;
  displayDate: Date | null;
  createdAt: Date;
}
