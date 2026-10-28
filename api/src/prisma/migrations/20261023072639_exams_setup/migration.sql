-- CreateEnum
CREATE TYPE "ExamStatus" AS ENUM ('DRAFT', 'OPEN', 'LOCKED', 'PUBLISHED');

-- AlterTable
ALTER TABLE "class_subjects" ADD COLUMN     "credit_hours" DECIMAL(4,2);

-- CreateTable
CREATE TABLE "grade_scales" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "grade_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grade_bands" (
    "id" UUID NOT NULL,
    "grade_scale_id" UUID NOT NULL,
    "grade" TEXT NOT NULL,
    "min_percent" DECIMAL(5,2) NOT NULL,
    "grade_point" DECIMAL(4,2) NOT NULL,
    "description" TEXT NOT NULL,
    "is_pass" BOOLEAN NOT NULL,

    CONSTRAINT "grade_bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "term_id" UUID,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "is_final" BOOLEAN NOT NULL DEFAULT false,
    "status" "ExamStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_subjects" (
    "exam_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "full_theory" DECIMAL(6,2) NOT NULL,
    "pass_theory" DECIMAL(6,2) NOT NULL,
    "full_practical" DECIMAL(6,2),
    "pass_practical" DECIMAL(6,2),
    "exam_date" DATE,

    CONSTRAINT "exam_subjects_pkey" PRIMARY KEY ("exam_id","class_id","subject_id")
);

-- CreateTable
CREATE TABLE "result_policies" (
    "id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "grade_scale_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "result_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_components" (
    "policy_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "weight_percent" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "result_components_pkey" PRIMARY KEY ("policy_id","exam_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grade_scales_name_key" ON "grade_scales"("name");

-- CreateIndex
CREATE UNIQUE INDEX "grade_bands_grade_scale_id_min_percent_key" ON "grade_bands"("grade_scale_id", "min_percent");

-- CreateIndex
CREATE UNIQUE INDEX "grade_bands_grade_scale_id_grade_key" ON "grade_bands"("grade_scale_id", "grade");

-- CreateIndex
CREATE UNIQUE INDEX "exams_academic_year_id_name_key" ON "exams"("academic_year_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "exams_academic_year_id_sequence_key" ON "exams"("academic_year_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "exams_id_academic_year_id_key" ON "exams"("id", "academic_year_id");

-- CreateIndex
CREATE INDEX "exam_subjects_academic_year_id_class_id_subject_id_idx" ON "exam_subjects"("academic_year_id", "class_id", "subject_id");

-- CreateIndex
CREATE INDEX "result_policies_grade_scale_id_idx" ON "result_policies"("grade_scale_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_policies_academic_year_id_class_id_key" ON "result_policies"("academic_year_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "result_policies_id_academic_year_id_key" ON "result_policies"("id", "academic_year_id");

-- CreateIndex
CREATE INDEX "result_components_exam_id_idx" ON "result_components"("exam_id");

-- AddForeignKey
ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_grade_scale_id_fkey" FOREIGN KEY ("grade_scale_id") REFERENCES "grade_scales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exams" ADD CONSTRAINT "exams_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_exam_id_academic_year_id_fkey" FOREIGN KEY ("exam_id", "academic_year_id") REFERENCES "exams"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_academic_year_id_class_id_subject_id_fkey" FOREIGN KEY ("academic_year_id", "class_id", "subject_id") REFERENCES "class_subjects"("academic_year_id", "class_id", "subject_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_policies" ADD CONSTRAINT "result_policies_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_policies" ADD CONSTRAINT "result_policies_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_policies" ADD CONSTRAINT "result_policies_grade_scale_id_fkey" FOREIGN KEY ("grade_scale_id") REFERENCES "grade_scales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_components" ADD CONSTRAINT "result_components_policy_id_academic_year_id_fkey" FOREIGN KEY ("policy_id", "academic_year_id") REFERENCES "result_policies"("id", "academic_year_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_components" ADD CONSTRAINT "result_components_exam_id_academic_year_id_fkey" FOREIGN KEY ("exam_id", "academic_year_id") REFERENCES "exams"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- append 
CREATE UNIQUE INDEX "grade_scales_one_default" ON "grade_scales" (is_default) WHERE is_default;
CREATE UNIQUE INDEX "exams_one_final" ON "exams" (academic_year_id) WHERE is_final;

ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_percent_check" CHECK (min_percent >= 0 AND min_percent <= 100);
ALTER TABLE "grade_bands" ADD CONSTRAINT "grade_bands_point_check" CHECK (grade_point >= 0);
ALTER TABLE "exams" ADD CONSTRAINT "exams_sequence_check" CHECK (sequence > 0);
ALTER TABLE "exam_subjects" ADD CONSTRAINT "exam_subjects_marks_check" CHECK (
  full_theory > 0 AND pass_theory >= 0 AND pass_theory <= full_theory
  AND ((full_practical IS NULL AND pass_practical IS NULL)
    OR (full_practical > 0 AND pass_practical >= 0 AND pass_practical <= full_practical))
);
ALTER TABLE "result_components" ADD CONSTRAINT "result_components_weight_check" CHECK (weight_percent > 0 AND weight_percent <= 100);
ALTER TABLE "class_subjects" ADD CONSTRAINT "class_subjects_credit_hours_check" CHECK (credit_hours IS NULL OR credit_hours > 0);

ALTER TABLE "grade_scales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "grade_bands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "exam_subjects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "result_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "result_components" ENABLE ROW LEVEL SECURITY;