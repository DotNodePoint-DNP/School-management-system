/*
  Warnings:

  - You are about to drop the column `photo_url` on the `students` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "enrollments_academic_year_id_section_id_roll_no_key";

-- AlterTable
ALTER TABLE "students" DROP COLUMN "photo_url";

-- CreateIndex
CREATE INDEX "enrollments_academic_year_id_section_id_idx" ON "enrollments"("academic_year_id", "section_id");


-- append 
-- Roll numbers must be unique among CURRENTLY ENROLLED students; withdrawn rows keep their historic number.
CREATE UNIQUE INDEX "enrollments_roll_no_unique_enrolled"
  ON "enrollments" (academic_year_id, section_id, roll_no)
  WHERE status = 'ENROLLED' AND roll_no IS NOT NULL;