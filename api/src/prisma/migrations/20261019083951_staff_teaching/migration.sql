/*
  Warnings:

  - A unique constraint covering the columns `[id,class_id]` on the table `sections` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "StaffKind" AS ENUM ('TEACHING', 'NON_TEACHING');

-- CreateEnum
CREATE TYPE "StaffStatus" AS ENUM ('ACTIVE', 'LEFT');

-- CreateTable
CREATE TABLE "sequences" (
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "sequences_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" UUID NOT NULL,
    "staff_no" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "last_name" TEXT NOT NULL,
    "full_name_np" TEXT,
    "gender" "Gender" NOT NULL,
    "date_of_birth" DATE,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "kind" "StaffKind" NOT NULL,
    "designation" TEXT,
    "join_date" DATE NOT NULL,
    "status" "StaffStatus" NOT NULL DEFAULT 'ACTIVE',
    "left_on" DATE,
    "status_note" TEXT,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_teacher_assignments" (
    "academic_year_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "class_teacher_assignments_pkey" PRIMARY KEY ("academic_year_id","section_id")
);

-- CreateTable
CREATE TABLE "teaching_assignments" (
    "academic_year_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "teaching_assignments_pkey" PRIMARY KEY ("academic_year_id","section_id","subject_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_staff_no_key" ON "staff"("staff_no");

-- CreateIndex
CREATE UNIQUE INDEX "staff_user_id_key" ON "staff"("user_id");

-- CreateIndex
CREATE INDEX "staff_last_name_first_name_idx" ON "staff"("last_name", "first_name");

-- CreateIndex
CREATE INDEX "staff_status_kind_idx" ON "staff"("status", "kind");

-- CreateIndex
CREATE INDEX "class_teacher_assignments_staff_id_idx" ON "class_teacher_assignments"("staff_id");

-- CreateIndex
CREATE INDEX "teaching_assignments_staff_id_idx" ON "teaching_assignments"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "sections_id_class_id_key" ON "sections"("id", "class_id");

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teacher_assignments" ADD CONSTRAINT "class_teacher_assignments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_section_id_class_id_fkey" FOREIGN KEY ("section_id", "class_id") REFERENCES "sections"("id", "class_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_academic_year_id_class_id_subject_id_fkey" FOREIGN KEY ("academic_year_id", "class_id", "subject_id") REFERENCES "class_subjects"("academic_year_id", "class_id", "subject_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_assignments" ADD CONSTRAINT "teaching_assignments_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;



-- appended
ALTER TABLE "staff" ADD CONSTRAINT "staff_left_check" CHECK ((status = 'LEFT') = (left_on IS NOT NULL));
ALTER TABLE "staff" ADD CONSTRAINT "staff_left_after_join_check" CHECK (left_on IS NULL OR left_on >= join_date);

ALTER TABLE "staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "class_teacher_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teaching_assignments" ENABLE ROW LEVEL SECURITY;