-- AlterTable
ALTER TABLE "exams" ADD COLUMN     "parent_release_on" DATE;

-- AlterTable
ALTER TABLE "student_guardians" ADD COLUMN     "portal_access" BOOLEAN NOT NULL DEFAULT true;
