-- CreateEnum
CREATE TYPE "PromotionAction" AS ENUM ('PROMOTE', 'REPEAT', 'GRADUATE', 'HOLD');

-- CreateEnum
CREATE TYPE "PromotionRunStatus" AS ENUM ('DRAFT', 'APPLYING', 'APPLIED');

-- CreateEnum
CREATE TYPE "DecisionBasis" AS ENUM ('RESULT', 'MANUAL');

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "next_class_id" UUID;

-- CreateTable
CREATE TABLE "promotion_runs" (
    "id" UUID NOT NULL,
    "from_year_id" UUID NOT NULL,
    "to_year_id" UUID NOT NULL,
    "status" "PromotionRunStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "applied_at" TIMESTAMPTZ(6),

    CONSTRAINT "promotion_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotion_decisions" (
    "run_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "from_class_id" UUID NOT NULL,
    "from_section_id" UUID NOT NULL,
    "action" "PromotionAction" NOT NULL,
    "basis" "DecisionBasis" NOT NULL,
    "to_class_id" UUID,
    "to_section_id" UUID,
    "result_status" "ResultStatus",
    "percentage" DECIMAL(5,2),
    "class_rank" INTEGER,
    "section_rank" INTEGER,
    "result_version" INTEGER,
    "note" TEXT,
    "new_enrollment_id" UUID,
    "applied_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "promotion_decisions_pkey" PRIMARY KEY ("run_id","enrollment_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "promotion_runs_from_year_id_to_year_id_key" ON "promotion_runs"("from_year_id", "to_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_decisions_new_enrollment_id_key" ON "promotion_decisions"("new_enrollment_id");

-- CreateIndex
CREATE INDEX "promotion_decisions_run_id_from_class_id_from_section_id_idx" ON "promotion_decisions"("run_id", "from_class_id", "from_section_id");

-- CreateIndex
CREATE INDEX "promotion_decisions_enrollment_id_idx" ON "promotion_decisions"("enrollment_id");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_next_class_id_fkey" FOREIGN KEY ("next_class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_runs" ADD CONSTRAINT "promotion_runs_from_year_id_fkey" FOREIGN KEY ("from_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_runs" ADD CONSTRAINT "promotion_runs_to_year_id_fkey" FOREIGN KEY ("to_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_decisions" ADD CONSTRAINT "promotion_decisions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "promotion_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_decisions" ADD CONSTRAINT "promotion_decisions_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_decisions" ADD CONSTRAINT "promotion_decisions_new_enrollment_id_fkey" FOREIGN KEY ("new_enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_decisions" ADD CONSTRAINT "promotion_decisions_to_class_id_fkey" FOREIGN KEY ("to_class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotion_decisions" ADD CONSTRAINT "promotion_decisions_to_section_id_to_class_id_fkey" FOREIGN KEY ("to_section_id", "to_class_id") REFERENCES "sections"("id", "class_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- appended
ALTER TABLE "classes" ADD CONSTRAINT "classes_next_class_check" CHECK (next_class_id IS NULL OR next_class_id <> id);
ALTER TABLE "promotion_runs" ADD CONSTRAINT "promotion_runs_years_check" CHECK (from_year_id <> to_year_id);

-- Graduates and held students have no destination. Promoted and repeating students always have a class,
-- and once moved they also have a section and the new enrollment.
ALTER TABLE "promotion_decisions" ADD CONSTRAINT "promotion_decisions_shape_check" CHECK (
  (action IN ('GRADUATE', 'HOLD') AND to_class_id IS NULL AND to_section_id IS NULL AND new_enrollment_id IS NULL)
  OR (
    action IN ('PROMOTE', 'REPEAT') AND to_class_id IS NOT NULL
    AND (applied_at IS NULL OR (to_section_id IS NOT NULL AND new_enrollment_id IS NOT NULL))
    AND (new_enrollment_id IS NULL OR applied_at IS NOT NULL)
  )
);

ALTER TABLE "promotion_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "promotion_decisions" ENABLE ROW LEVEL SECURITY;