CREATE TYPE "WebsiteSection" AS ENUM ('home', 'about', 'academics', 'facilities', 'notices', 'events', 'gallery', 'careers');

CREATE TABLE "website_entries" (
    "id" UUID PRIMARY KEY,
    "section" "WebsiteSection" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "image_url" TEXT,
    "image_alt" TEXT,
    "display_date" DATE,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "website_entries_section_published_created_at_id_idx"
    ON "website_entries" ("section", "published", "created_at", "id");
