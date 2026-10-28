-- CreateEnum
CREATE TYPE "FileKind" AS ENUM ('LOGO', 'SEAL', 'SIGNATURE');

-- CreateEnum
CREATE TYPE "DocumentLanguage" AS ENUM ('EN', 'NP', 'BOTH');

-- CreateTable
CREATE TABLE "stored_files" (
    "id" UUID NOT NULL,
    "kind" "FileKind" NOT NULL,
    "object_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_profile" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name_en" TEXT NOT NULL,
    "name_np" TEXT,
    "short_name" TEXT,
    "tagline_en" TEXT,
    "tagline_np" TEXT,
    "school_type" TEXT,
    "established_on" DATE,
    "province" TEXT,
    "district" TEXT,
    "local_level" TEXT,
    "ward_no" INTEGER,
    "tole" TEXT,
    "postal_code" TEXT,
    "address_line_np" TEXT,
    "phones" JSONB NOT NULL DEFAULT '[]',
    "email" TEXT,
    "website" TEXT,
    "identifiers" JSONB NOT NULL DEFAULT '[]',
    "document_language" "DocumentLanguage" NOT NULL DEFAULT 'BOTH',
    "nepali_digits" BOOLEAN NOT NULL DEFAULT false,
    "admission_no_prefix" TEXT NOT NULL DEFAULT 'ADM',
    "staff_no_prefix" TEXT NOT NULL DEFAULT 'STF',
    "logo_file_id" UUID,
    "seal_file_id" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_by_id" UUID,

    CONSTRAINT "school_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_profile_versions" (
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "changed_by_id" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_profile_versions_pkey" PRIMARY KEY ("version")
);

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_object_key_key" ON "stored_files"("object_key");

-- AddForeignKey
ALTER TABLE "school_profile" ADD CONSTRAINT "school_profile_logo_file_id_fkey" FOREIGN KEY ("logo_file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_profile" ADD CONSTRAINT "school_profile_seal_file_id_fkey" FOREIGN KEY ("seal_file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- appended
ALTER TABLE "school_profile" ADD CONSTRAINT "school_profile_singleton" CHECK (id = 1);
ALTER TABLE "school_profile" ADD CONSTRAINT "school_profile_ward_check" CHECK (ward_no IS NULL OR ward_no > 0);
ALTER TABLE "school_profile" ADD CONSTRAINT "school_profile_prefix_check"
  CHECK (admission_no_prefix ~ '^[A-Z0-9]{1,8}$' AND staff_no_prefix ~ '^[A-Z0-9]{1,8}$');
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_size_check" CHECK (size_bytes > 0 AND width > 0 AND height > 0);

CREATE FUNCTION public.school_profile_versions_block_changes() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'school_profile_versions is append-only';
END;
$$;

CREATE TRIGGER school_profile_versions_no_update_delete
  BEFORE UPDATE OR DELETE ON "school_profile_versions"
  FOR EACH ROW EXECUTE FUNCTION public.school_profile_versions_block_changes();

ALTER TABLE "stored_files" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_profile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "school_profile_versions" ENABLE ROW LEVEL SECURITY;