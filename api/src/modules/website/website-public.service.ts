import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type WebsiteSection } from '../../generated/prisma/client.js';
import { toPaginated } from '../../common/dto/pagination.dto.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  ApplicationDto,
  ContactDto,
  NoticeQueryDto,
  EventQueryDto,
} from './dto/cms.dto.js';

export function visibleNotice(now: Date): Prisma.NoticeWhereInput {
  return {
    published: true,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}
export function openCareer(now: Date): Prisma.CareerPostingWhereInput {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kathmandu',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return {
    published: true,
    OR: [
      { deadline: null },
      { deadline: { gte: new Date(day + 'T00:00:00Z') } },
    ],
  };
}
const photoOrder = [
  { sortOrder: 'asc' },
  { createdAt: 'asc' },
  { id: 'asc' },
] satisfies Prisma.GalleryPhotoOrderByWithRelationInput[];
@Injectable()
export class WebsitePublicService {
  constructor(private readonly db: PrismaService) {}
  entries(section?: WebsiteSection) {
    return this.db.websiteEntry.findMany({
      where: { published: true, section },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    });
  }
  async notices(query: NoticeQueryDto) {
    const where = { ...visibleNotice(new Date()), category: query.category };
    const [rows, count] = await this.db.$transaction([
      this.db.notice.findMany({
        where,
        orderBy: [
          { isPinned: 'desc' },
          { publishedAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.db.notice.count({ where }),
    ]);
    return toPaginated(rows, count, {
      page: query.page,
      pageSize: query.limit,
    });
  }
  notice(slug: string) {
    return this.db.notice.findFirstOrThrow({
      where: { ...visibleNotice(new Date()), slug },
    });
  }
  events(filter: EventQueryDto['filter']) {
    const now = new Date();
    // Ongoing multi-day events stay on the upcoming calendar until their end.
    const date = filter === 'past' ? { lt: now } : { gte: now };
    const where: Prisma.WebsiteEventWhereInput = {
      published: true,
      ...(filter
        ? { OR: [{ endsAt: date }, { endsAt: null, startsAt: date }] }
        : {}),
    };
    return this.db.websiteEvent.findMany({
      where,
      orderBy: [
        { startsAt: filter === 'past' ? 'desc' : 'asc' },
        { id: 'asc' },
      ],
    });
  }
  event(slug: string) {
    return this.db.websiteEvent.findFirstOrThrow({
      where: { slug, published: true },
    });
  }
  albums() {
    return this.db.galleryAlbum.findMany({
      where: { published: true },
      orderBy: [
        { sortOrder: 'asc' },
        { eventDate: { sort: 'desc', nulls: 'last' } },
        { createdAt: 'desc' },
        { id: 'asc' },
      ],
      include: { _count: { select: { photos: true } } },
    });
  }
  album(slug: string) {
    return this.db.galleryAlbum.findFirstOrThrow({
      where: { slug, published: true },
      include: { photos: { orderBy: photoOrder } },
    });
  }
  careers() {
    return this.db.careerPosting.findMany({
      where: openCareer(new Date()),
      orderBy: [
        { deadline: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'desc' },
        { id: 'asc' },
      ],
    });
  }
  career(slug: string) {
    return this.db.careerPosting.findFirstOrThrow({
      where: { slug, ...openCareer(new Date()) },
    });
  }
  async apply(slug: string, dto: ApplicationDto) {
    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM career_postings WHERE slug=${slug} FOR SHARE`;
      const posting = await tx.careerPosting.findFirst({
        where: { slug, ...openCareer(new Date()) },
        select: { id: true },
      });
      if (!posting) throw new NotFoundException('Open vacancy not found');
      await tx.jobApplication.create({
        data: { ...dto, postingId: posting.id },
      });
      return { received: true };
    });
  }
  async contact(dto: ContactDto, ipAddress: string | null) {
    const { website, ...data } = dto;
    if (!website?.trim())
      await this.db.contactSubmission.create({ data: { ...data, ipAddress } });
    return { received: true };
  }
}
