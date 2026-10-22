/*
  Warnings:

  - A unique constraint covering the columns `[id,academic_year_id,class_id]` on the table `enrollments` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "student_subject_choices" (
    "enrollment_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_subject_choices_pkey" PRIMARY KEY ("enrollment_id","subject_id")
);

-- CreateIndex
CREATE INDEX "student_subject_choices_academic_year_id_class_id_subject_i_idx" ON "student_subject_choices"("academic_year_id", "class_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_id_academic_year_id_class_id_key" ON "enrollments"("id", "academic_year_id", "class_id");

-- AddForeignKey
ALTER TABLE "student_subject_choices" ADD CONSTRAINT "student_subject_choices_enrollment_id_academic_year_id_cla_fkey" FOREIGN KEY ("enrollment_id", "academic_year_id", "class_id") REFERENCES "enrollments"("id", "academic_year_id", "class_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_subject_choices" ADD CONSTRAINT "student_subject_choices_academic_year_id_class_id_subject__fkey" FOREIGN KEY ("academic_year_id", "class_id", "subject_id") REFERENCES "class_subjects"("academic_year_id", "class_id", "subject_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_subject_choices" ENABLE ROW LEVEL SECURITY;