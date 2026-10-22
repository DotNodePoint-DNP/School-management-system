-- CreateEnum
CREATE TYPE "AcademicYearStatus" AS ENUM ('PLANNED', 'ACTIVE', 'CLOSED');

-- CreateTable
CREATE TABLE "academic_years" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "AcademicYearStatus" NOT NULL DEFAULT 'PLANNED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "terms" (
    "id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_subjects" (
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "is_compulsory" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "class_subjects_pkey" PRIMARY KEY ("academic_year_id","class_id","subject_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_name_key" ON "academic_years"("name");

-- CreateIndex
CREATE UNIQUE INDEX "terms_academic_year_id_sequence_key" ON "terms"("academic_year_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "terms_academic_year_id_name_key" ON "terms"("academic_year_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "classes_name_key" ON "classes"("name");

-- CreateIndex
CREATE INDEX "classes_sort_order_idx" ON "classes"("sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "sections_class_id_name_key" ON "sections"("class_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_code_key" ON "subjects"("code");

-- CreateIndex
CREATE INDEX "class_subjects_class_id_idx" ON "class_subjects"("class_id");

-- CreateIndex
CREATE INDEX "class_subjects_subject_id_idx" ON "class_subjects"("subject_id");

-- AddForeignKey
ALTER TABLE "terms" ADD CONSTRAINT "terms_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- btree_gist lets one exclusion constraint combine "same academic year" (=) with "dates overlap" (&&).
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- Academic years: valid range, no overlap (inclusive of both end days), at most one ACTIVE.
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_dates_check" CHECK (end_date > start_date);
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_no_overlap"
  EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&);
CREATE UNIQUE INDEX "academic_years_one_active" ON "academic_years" (status) WHERE status = 'ACTIVE';

-- Terms: valid range, no overlap within the same academic year.
ALTER TABLE "terms" ADD CONSTRAINT "terms_dates_check" CHECK (end_date > start_date);
ALTER TABLE "terms" ADD CONSTRAINT "terms_no_overlap"
  EXCLUDE USING gist (academic_year_id WITH =, daterange(start_date, end_date, '[]') WITH &&);

ALTER TABLE "classes" ADD CONSTRAINT "classes_sort_order_check" CHECK (sort_order > 0);
ALTER TABLE "sections" ADD CONSTRAINT "sections_capacity_check" CHECK (capacity IS NULL OR capacity > 0);

ALTER TABLE "academic_years" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "terms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "classes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subjects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "class_subjects" ENABLE ROW LEVEL SECURITY;