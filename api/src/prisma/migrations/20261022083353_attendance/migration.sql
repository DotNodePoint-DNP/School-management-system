/*
  Warnings:

  - A unique constraint covering the columns `[id,academic_year_id]` on the table `enrollments` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'LEAVE');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('MANUAL', 'CORRECTION');

-- CreateEnum
CREATE TYPE "CalendarEntryKind" AS ENUM ('HOLIDAY', 'WORKING_DAY');

-- AlterTable
ALTER TABLE "academic_years" ADD COLUMN     "attendance_edit_window_days" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "weekly_off_days" INTEGER[] DEFAULT ARRAY[0, 6]::INTEGER[];

-- CreateTable
CREATE TABLE "calendar_entries" (
    "id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "kind" "CalendarEntryKind" NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calendar_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "taken_by_id" UUID NOT NULL,
    "taken_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "session_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "note" TEXT,
    "source" "AttendanceSource" NOT NULL DEFAULT 'MANUAL',
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("session_id","enrollment_id")
);

-- CreateTable
CREATE TABLE "attendance_changes" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "from_status" "AttendanceStatus",
    "to_status" "AttendanceStatus" NOT NULL,
    "reason" TEXT,
    "within_window" BOOLEAN NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "calendar_entries_academic_year_id_date_key" ON "calendar_entries"("academic_year_id", "date");

-- CreateIndex
CREATE INDEX "attendance_sessions_academic_year_id_date_idx" ON "attendance_sessions"("academic_year_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_section_id_date_key" ON "attendance_sessions"("section_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sessions_id_date_academic_year_id_key" ON "attendance_sessions"("id", "date", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_enrollment_id_date_key" ON "attendance_records"("enrollment_id", "date");

-- CreateIndex
CREATE INDEX "attendance_changes_enrollment_id_changed_at_idx" ON "attendance_changes"("enrollment_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "attendance_changes_session_id_changed_at_idx" ON "attendance_changes"("session_id", "changed_at" DESC);

-- CreateIndex
CREATE INDEX "attendance_changes_changed_at_idx" ON "attendance_changes"("changed_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "enrollments_id_academic_year_id_key" ON "enrollments"("id", "academic_year_id");

-- AddForeignKey
ALTER TABLE "calendar_entries" ADD CONSTRAINT "calendar_entries_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_date_academic_year_id_fkey" FOREIGN KEY ("session_id", "date", "academic_year_id") REFERENCES "attendance_sessions"("id", "date", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_enrollment_id_academic_year_id_fkey" FOREIGN KEY ("enrollment_id", "academic_year_id") REFERENCES "enrollments"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- append 
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_off_days_check"
  CHECK (weekly_off_days <@ ARRAY[0,1,2,3,4,5,6] AND cardinality(weekly_off_days) < 7);
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_edit_window_check"
  CHECK (attendance_edit_window_days BETWEEN 0 AND 30);

CREATE FUNCTION public.attendance_changes_block_changes() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'attendance_changes is append-only';
END;
$$;

CREATE TRIGGER attendance_changes_no_update_delete
  BEFORE UPDATE OR DELETE ON "attendance_changes"
  FOR EACH ROW EXECUTE FUNCTION public.attendance_changes_block_changes();

ALTER TABLE "calendar_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "attendance_changes" ENABLE ROW LEVEL SECURITY;