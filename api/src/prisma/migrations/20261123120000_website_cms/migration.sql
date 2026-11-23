BEGIN;
ALTER TABLE website_entries RENAME TO previous_website_entries;
ALTER TABLE previous_website_entries RENAME CONSTRAINT website_entries_pkey TO previous_website_entries_pkey;
ALTER TYPE "WebsiteSection" RENAME TO "PreviousWebsiteSection";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WebsiteSection" AS ENUM ('home', 'about', 'academics', 'facilities');

-- CreateEnum
CREATE TYPE "NoticeCategory" AS ENUM ('general', 'exam', 'holiday', 'admission', 'result', 'event');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('full_time', 'part_time', 'contract', 'internship');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('received', 'shortlisted', 'interviewed', 'offered', 'rejected');

-- CreateEnum
CREATE TYPE "InquiryType" AS ENUM ('general', 'admission', 'feedback', 'complaint');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('unread', 'in_progress', 'resolved', 'spam');

-- CreateTable
CREATE TABLE "website_entries" (
    "id" UUID NOT NULL,
    "section" "WebsiteSection" NOT NULL,
    "slug" TEXT,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "body" TEXT NOT NULL,
    "image_url" TEXT,
    "image_alt" TEXT,
    "metadata" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "website_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "category" "NoticeCategory" NOT NULL DEFAULT 'general',
    "attachment_url" TEXT,
    "image_url" TEXT,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "website_events" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "description" TEXT NOT NULL,
    "venue" TEXT,
    "cover_image" TEXT,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "is_all_day" BOOLEAN NOT NULL DEFAULT false,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "website_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_albums" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cover_image" TEXT,
    "event_date" DATE,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gallery_albums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_photos" (
    "id" UUID NOT NULL,
    "album_id" UUID NOT NULL,
    "image_url" TEXT NOT NULL,
    "caption" TEXT,
    "alt_text" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gallery_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_postings" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "employment_type" "EmploymentType" NOT NULL DEFAULT 'full_time',
    "vacancies" INTEGER NOT NULL DEFAULT 1,
    "qualification" TEXT,
    "experience" TEXT,
    "description" TEXT NOT NULL,
    "deadline" DATE,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "career_postings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_applications" (
    "id" UUID NOT NULL,
    "posting_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "resume_url" TEXT NOT NULL,
    "cover_letter" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'received',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_submissions" (
    "id" UUID NOT NULL,
    "type" "InquiryType" NOT NULL DEFAULT 'general',
    "full_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "student_name" TEXT,
    "target_grade" TEXT,
    "status" "InquiryStatus" NOT NULL DEFAULT 'unread',
    "admin_notes" TEXT,
    "ip_address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contact_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "website_entries_slug_key" ON "website_entries"("slug");

-- CreateIndex
CREATE INDEX "website_entries_section_published_sort_order_created_at_idx" ON "website_entries"("section", "published", "sort_order" ASC, "created_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "notices_slug_key" ON "notices"("slug");

-- CreateIndex
CREATE INDEX "notices_published_is_pinned_published_at_created_at_idx" ON "notices"("published", "is_pinned" DESC, "published_at" DESC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "notices_category_published_idx" ON "notices"("category", "published");

-- CreateIndex
CREATE UNIQUE INDEX "website_events_slug_key" ON "website_events"("slug");

-- CreateIndex
CREATE INDEX "website_events_published_starts_at_idx" ON "website_events"("published", "starts_at" ASC);

-- CreateIndex
CREATE INDEX "website_events_published_is_featured_starts_at_idx" ON "website_events"("published", "is_featured" DESC, "starts_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "gallery_albums_slug_key" ON "gallery_albums"("slug");

-- CreateIndex
CREATE INDEX "gallery_albums_published_sort_order_event_date_created_at_idx" ON "gallery_albums"("published", "sort_order" ASC, "event_date" DESC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "gallery_photos_album_id_sort_order_created_at_idx" ON "gallery_photos"("album_id", "sort_order" ASC, "created_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "career_postings_slug_key" ON "career_postings"("slug");

-- CreateIndex
CREATE INDEX "career_postings_published_deadline_created_at_idx" ON "career_postings"("published", "deadline" ASC, "created_at" DESC);

-- CreateIndex
CREATE INDEX "job_applications_posting_id_status_created_at_idx" ON "job_applications"("posting_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "contact_submissions_status_type_created_at_idx" ON "contact_submissions"("status", "type", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "gallery_photos" ADD CONSTRAINT "gallery_photos_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "gallery_albums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_posting_id_fkey" FOREIGN KEY ("posting_id") REFERENCES "career_postings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve fields used by the original website routes.
ALTER TABLE website_entries ADD COLUMN display_date DATE;
ALTER TABLE notices ADD COLUMN image_alt TEXT;
ALTER TABLE website_events ADD COLUMN image_alt TEXT;
ALTER TABLE gallery_albums ADD COLUMN image_alt TEXT;
ALTER TABLE career_postings ADD COLUMN image_url TEXT, ADD COLUMN image_alt TEXT;

-- IDs remain stable. The legacy identifier makes backfilled slugs collision-free.
CREATE TEMP VIEW previous_content AS
SELECT *, concat_ws('-', nullif(trim(both '-' from regexp_replace(lower(title), '[^[:alnum:]]+', '-', 'g')), ''), id::text) AS slug
FROM previous_website_entries;

INSERT INTO website_entries (id,section,slug,title,body,image_url,image_alt,display_date,published,created_at,updated_at)
SELECT id,section::text::"WebsiteSection",slug,title,body,image_url,image_alt,display_date,published,created_at,created_at
FROM previous_content WHERE section IN ('home','about','academics','facilities');

INSERT INTO notices (id,slug,title,body,image_url,image_alt,published,published_at,created_at,updated_at)
SELECT id,slug,title,body,image_url,image_alt,published,coalesce(display_date::timestamp AT TIME ZONE 'Asia/Kathmandu',created_at),created_at,created_at FROM previous_content WHERE section='notices';
INSERT INTO website_events (id,slug,title,description,cover_image,image_alt,starts_at,published,created_at,updated_at)
SELECT id,slug,title,body,image_url,image_alt,coalesce(display_date::timestamp AT TIME ZONE 'Asia/Kathmandu',created_at),published,created_at,created_at FROM previous_content WHERE section='events';
INSERT INTO gallery_albums (id,slug,title,description,cover_image,image_alt,event_date,published,created_at,updated_at)
SELECT id,slug,title,body,image_url,image_alt,display_date,published,created_at,created_at FROM previous_content WHERE section='gallery';
INSERT INTO gallery_photos (id,album_id,image_url,alt_text,created_at)
SELECT id,id,image_url,image_alt,created_at FROM previous_content WHERE section='gallery' AND image_url IS NOT NULL;
INSERT INTO career_postings (id,slug,title,description,image_url,image_alt,deadline,published,created_at,updated_at)
SELECT id,slug,title,body,image_url,image_alt,display_date,published,created_at,created_at FROM previous_content WHERE section='careers';

DROP VIEW previous_content;
DROP TABLE previous_website_entries;
DROP TYPE "PreviousWebsiteSection";
ALTER TABLE website_events ADD CONSTRAINT website_event_valid_interval CHECK (ends_at IS NULL OR ends_at >= starts_at);
ALTER TABLE career_postings ADD CONSTRAINT positive_vacancies CHECK (vacancies > 0);

-- Read projection for the original website client.
CREATE VIEW website_section_feed AS
SELECT id, section::text, title, body, image_url, image_alt, display_date::timestamptz, published, created_at, NULL::timestamptz AS expires_at FROM website_entries
UNION ALL SELECT id,'notices',title,body,image_url,image_alt,published_at,published,created_at,expires_at FROM notices
UNION ALL SELECT id,'events',title,description,cover_image,image_alt,starts_at,published,created_at,NULL FROM website_events
UNION ALL SELECT id,'gallery',title,coalesce(description,''),cover_image,image_alt,event_date::timestamptz,published,created_at,NULL FROM gallery_albums
UNION ALL SELECT id,'careers',title,description,image_url,image_alt,deadline::timestamptz,published,created_at,
((deadline+1)::timestamp AT TIME ZONE 'Asia/Kathmandu') FROM career_postings;
COMMIT;
