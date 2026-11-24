import { applyDecorators } from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
  registerDecorator,
} from 'class-validator';
import { isURL } from 'class-validator';
import {
  ApplicationStatus,
  EmploymentType,
  InquiryStatus,
  InquiryType,
  NoticeCategory,
  WebsiteSection,
  type Prisma,
} from '../../../generated/prisma/client.js';
import { Trim } from '../../../common/decorators/trim.decorator.js';

// Optional non-nullable columns accept omission but reject an explicit null.
const WhenPresent = () => ValidateIf((_object, value) => value !== undefined);
const CalendarDate = () =>
  applyDecorators(
    Matches(/^\d{4}-\d{2}-\d{2}$/),
    IsDateString({ strict: true }),
  );
const Instant = () =>
  applyDecorators(
    Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/i),
    IsDateString({ strict: true }),
  );
function AssetUrl(): PropertyDecorator {
  return (target, key) =>
    registerDecorator({
      name: 'assetUrl',
      target: target.constructor,
      propertyName: String(key),
      validator: {
        validate(value: unknown) {
          return (
            typeof value === 'string' &&
            value.length <= 2048 &&
            (/^\/api\/v1\/public\/website\/files\/[a-f0-9-]{36}\.(png|pdf)$/.test(
              value,
            ) ||
              isURL(value, {
                protocols: ['https'],
                require_protocol: true,
                disallow_auth: true,
              }))
          );
        },
        defaultMessage() {
          return 'Use an HTTPS URL or a website upload URL';
        },
      },
    });
}

export class EntryDto {
  @IsEnum(WebsiteSection)
  section!: WebsiteSection;

  @Trim()
  @IsString()
  @Length(1, 180)
  title!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  subtitle?: string | null;

  @Trim()
  @IsString()
  @Length(1, 40000)
  body!: string;

  @IsOptional()
  @AssetUrl()
  imageUrl?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  imageAlt?: string | null;

  @IsOptional()
  @IsObject()
  metadata?: Prisma.InputJsonObject | null;

  @WhenPresent()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  sortOrder?: number;

  @WhenPresent()
  @IsBoolean()
  published?: boolean;
}

export class UpdateEntryDto extends EntryDto {
  @WhenPresent() declare section: WebsiteSection;
  @WhenPresent() declare title: string;
  @WhenPresent() declare body: string;
}

export class NoticeDto {
  @Trim()
  @IsString()
  @Length(1, 180)
  title!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  summary?: string | null;

  @Trim()
  @IsString()
  @Length(1, 40000)
  body!: string;

  @WhenPresent()
  @IsEnum(NoticeCategory)
  category?: NoticeCategory;

  @IsOptional()
  @AssetUrl()
  attachmentUrl?: string | null;

  @IsOptional()
  @AssetUrl()
  imageUrl?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  imageAlt?: string | null;

  @WhenPresent()
  @IsBoolean()
  isPinned?: boolean;

  @WhenPresent()
  @IsBoolean()
  published?: boolean;

  @IsOptional()
  @Instant()
  expiresAt?: string | null;
}

export class UpdateNoticeDto extends NoticeDto {
  @WhenPresent() declare title: string;
  @WhenPresent() declare body: string;
}

export class EventDto {
  @Trim()
  @IsString()
  @Length(1, 180)
  title!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  summary?: string | null;

  @Trim()
  @IsString()
  @Length(1, 40000)
  description!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  venue?: string | null;

  @IsOptional()
  @AssetUrl()
  coverImage?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  imageAlt?: string | null;

  @Instant()
  startsAt!: string;

  @IsOptional()
  @Instant()
  endsAt?: string | null;

  @WhenPresent()
  @IsBoolean()
  isAllDay?: boolean;

  @WhenPresent()
  @IsBoolean()
  isFeatured?: boolean;

  @WhenPresent()
  @IsBoolean()
  published?: boolean;
}

export class UpdateEventDto extends EventDto {
  @WhenPresent() declare title: string;
  @WhenPresent() declare description: string;
  @WhenPresent() declare startsAt: string;
}

export class AlbumDto {
  @Trim()
  @IsString()
  @Length(1, 180)
  title!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 40000)
  description?: string | null;

  @IsOptional()
  @AssetUrl()
  coverImage?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  imageAlt?: string | null;

  @IsOptional()
  @CalendarDate()
  eventDate?: string | null;

  @WhenPresent()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  sortOrder?: number;

  @WhenPresent()
  @IsBoolean()
  published?: boolean;
}

export class UpdateAlbumDto extends AlbumDto {
  @WhenPresent() declare title: string;
}

export class CareerDto {
  @Trim()
  @IsString()
  @Length(1, 180)
  title!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  department?: string | null;

  @WhenPresent()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @WhenPresent()
  @IsInt()
  @Min(1)
  @Max(10000)
  vacancies?: number;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  qualification?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  experience?: string | null;

  @Trim()
  @IsString()
  @Length(1, 40000)
  description!: string;

  @IsOptional()
  @CalendarDate()
  deadline?: string | null;

  @WhenPresent()
  @IsBoolean()
  published?: boolean;

  @IsOptional()
  @AssetUrl()
  imageUrl?: string | null;

  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(2000)
  imageAlt?: string | null;
}

export class UpdateCareerDto extends CareerDto {
  @WhenPresent() declare title: string;
  @WhenPresent() declare description: string;
}

export class PublishDto {
  @IsBoolean() published!: boolean;
}
export class ListDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(1000000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
export class EntryQueryDto {
  @IsOptional() @IsEnum(WebsiteSection) section?: WebsiteSection;
}
export class NoticeQueryDto extends ListDto {
  @IsOptional() @IsEnum(NoticeCategory) category?: NoticeCategory;
}
export class EventQueryDto {
  @IsOptional() @IsIn(['upcoming', 'past']) filter?: 'upcoming' | 'past';
}
export class PhotoDto {
  @AssetUrl() imageUrl!: string;
  @IsOptional() @Trim() @IsString() @MaxLength(1000) caption?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(300) altText?: string;
}
export class PhotosDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PhotoDto)
  photos!: PhotoDto[];
}
export class PhotoIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  photoIds!: string[];
}
export class ApplicationDto {
  @Trim() @IsString() @Length(1, 180) fullName!: string;
  @Trim() @IsEmail() @MaxLength(254) email!: string;
  @Trim() @Matches(/^(?=(?:\D*\d){7,15}\D*$)\+?[\d ()-]{7,25}$/) phone!: string;
  @IsUrl({ protocols: ['https'], require_protocol: true, disallow_auth: true })
  @MaxLength(2048)
  resumeUrl!: string;
  @IsOptional() @Trim() @IsString() @MaxLength(10000) coverLetter?: string;
}
export class ContactDto {
  @WhenPresent() @IsEnum(InquiryType) type?: InquiryType;
  @Trim() @IsString() @Length(1, 180) fullName!: string;
  @IsOptional() @Trim() @IsEmail() @MaxLength(254) email?: string;
  @Trim() @Matches(/^(?=(?:\D*\d){7,15}\D*$)\+?[\d ()-]{7,25}$/) phone!: string;
  @IsOptional() @Trim() @IsString() @MaxLength(250) subject?: string;
  @Trim() @IsString() @Length(1, 10000) message!: string;
  @IsOptional() @Trim() @IsString() @MaxLength(180) studentName?: string;
  @IsOptional() @Trim() @IsString() @MaxLength(100) targetGrade?: string;
  @IsOptional() @IsString() @MaxLength(2048) website?: string;
}
export class ApplicationStatusDto {
  @IsEnum(ApplicationStatus) status!: ApplicationStatus;
  @IsOptional() @IsString() @MaxLength(10000) notes?: string;
}
export class InquiryStatusDto {
  @IsEnum(InquiryStatus) status!: InquiryStatus;
  @IsOptional() @IsString() @MaxLength(10000) adminNotes?: string;
}
