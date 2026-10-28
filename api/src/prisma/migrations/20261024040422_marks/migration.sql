-- CreateEnum
CREATE TYPE "MarkSheetStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "locked_at" TIMESTAMPTZ(6),
ADD COLUMN     "published_at" TIMESTAMPTZ(6);

-- CreateTable
CREATE TABLE "mark_sheets" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "status" "MarkSheetStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_by_id" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mark_sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marks" (
    "sheet_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "theory" DECIMAL(6,2),
    "practical" DECIMAL(6,2),
    "absent" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "marks_pkey" PRIMARY KEY ("sheet_id","enrollment_id")
);

-- CreateTable
CREATE TABLE "mark_changes" (
    "id" UUID NOT NULL,
    "sheet_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "from_theory" DECIMAL(6,2),
    "from_practical" DECIMAL(6,2),
    "from_absent" BOOLEAN,
    "to_theory" DECIMAL(6,2),
    "to_practical" DECIMAL(6,2),
    "to_absent" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "exam_status" "ExamStatus" NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mark_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mark_sheets_exam_id_section_id_subject_id_key" ON "mark_sheets"("exam_id", "section_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "mark_sheets_id_academic_year_id_class_id_key" ON "mark_sheets"("id", "academic_year_id", "class_id");

-- CreateIndex
CREATE INDEX "marks_enrollment_id_idx" ON "marks"("enrollment_id");

-- CreateIndex
CREATE INDEX "mark_changes_exam_id_changed_at_idx" ON "mark_changes"("exam_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "mark_changes_enrollment_id_changed_at_idx" ON "mark_changes"("enrollment_id", "changed_at" DESC);

-- AddForeignKey
ALTER TABLE "mark_sheets" ADD CONSTRAINT "mark_sheets_exam_id_academic_year_id_fkey" FOREIGN KEY ("exam_id", "academic_year_id") REFERENCES "exams"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_sheets" ADD CONSTRAINT "mark_sheets_exam_id_class_id_subject_id_fkey" FOREIGN KEY ("exam_id", "class_id", "subject_id") REFERENCES "exam_subjects"("exam_id", "class_id", "subject_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mark_sheets" ADD CONSTRAINT "mark_sheets_section_id_class_id_fkey" FOREIGN KEY ("section_id", "class_id") REFERENCES "sections"("id", "class_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks" ADD CONSTRAINT "marks_sheet_id_academic_year_id_class_id_fkey" FOREIGN KEY ("sheet_id", "academic_year_id", "class_id") REFERENCES "mark_sheets"("id", "academic_year_id", "class_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marks" ADD CONSTRAINT "marks_enrollment_id_academic_year_id_class_id_fkey" FOREIGN KEY ("enrollment_id", "academic_year_id", "class_id") REFERENCES "enrollments"("id", "academic_year_id", "class_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- append
-- An absent student has no marks; otherwise at least one component is entered. Marks are never negative.
ALTER TABLE "marks" ADD CONSTRAINT "marks_values_check" CHECK (
  (absent AND theory IS NULL AND practical IS NULL)
  OR (NOT absent AND (theory IS NOT NULL OR practical IS NOT NULL))
);
ALTER TABLE "marks" ADD CONSTRAINT "marks_nonneg_check" CHECK ((theory IS NULL OR theory >= 0) AND (practical IS NULL OR practical >= 0));
ALTER TABLE "mark_sheets" ADD CONSTRAINT "mark_sheets_submitted_check" CHECK ((status = 'SUBMITTED') = (submitted_at IS NOT NULL));

CREATE FUNCTION public.mark_changes_block_changes() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'mark_changes is append-only';
END;
$$;

CREATE TRIGGER mark_changes_no_update_delete
  BEFORE UPDATE OR DELETE ON "mark_changes"
  FOR EACH ROW EXECUTE FUNCTION public.mark_changes_block_changes();

ALTER TABLE "mark_sheets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "marks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mark_changes" ENABLE ROW LEVEL SECURITY;