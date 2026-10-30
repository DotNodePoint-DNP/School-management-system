-- CreateTable
CREATE TABLE "report_remarks" (
    "id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "scope_key" TEXT NOT NULL,
    "remark" TEXT NOT NULL,
    "updated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "report_remarks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "report_remarks_academic_year_id_scope_key_idx" ON "report_remarks"("academic_year_id", "scope_key");

-- CreateIndex
CREATE UNIQUE INDEX "report_remarks_enrollment_id_scope_key_key" ON "report_remarks"("enrollment_id", "scope_key");

-- AddForeignKey
ALTER TABLE "report_remarks" ADD CONSTRAINT "report_remarks_enrollment_id_academic_year_id_fkey" FOREIGN KEY ("enrollment_id", "academic_year_id") REFERENCES "enrollments"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- appended
ALTER TABLE "report_remarks" ADD CONSTRAINT "report_remarks_scope_check"
  CHECK (scope_key = 'POLICY' OR scope_key ~ '^EXAM:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
ALTER TABLE "report_remarks" ADD CONSTRAINT "report_remarks_text_check" CHECK (char_length(remark) BETWEEN 1 AND 500);
ALTER TABLE "report_remarks" ENABLE ROW LEVEL SECURITY;