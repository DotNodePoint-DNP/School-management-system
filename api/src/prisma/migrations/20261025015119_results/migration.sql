-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('PASS', 'FAIL', 'INCOMPLETE');

-- CreateTable
CREATE TABLE "result_runs" (
    "id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "scope_key" TEXT NOT NULL,
    "exam_id" UUID,
    "version" INTEGER NOT NULL,
    "revised" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grade_scale" JSONB NOT NULL,
    "components" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,

    CONSTRAINT "result_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_rows" (
    "run_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "section_id" UUID NOT NULL,
    "status" "ResultStatus" NOT NULL,
    "total_marks" DECIMAL(10,2),
    "total_full" DECIMAL(10,2),
    "percentage" DECIMAL(5,2),
    "gpa" DECIMAL(4,2),
    "section_rank" INTEGER,
    "class_rank" INTEGER,
    "payload" JSONB NOT NULL,

    CONSTRAINT "result_rows_pkey" PRIMARY KEY ("run_id","enrollment_id")
);

-- CreateIndex
CREATE INDEX "result_runs_academic_year_id_class_id_scope_key_idx" ON "result_runs"("academic_year_id", "class_id", "scope_key");

-- CreateIndex
CREATE UNIQUE INDEX "result_runs_academic_year_id_class_id_scope_key_version_key" ON "result_runs"("academic_year_id", "class_id", "scope_key", "version");

-- CreateIndex
CREATE INDEX "result_rows_enrollment_id_idx" ON "result_rows"("enrollment_id");

-- AddForeignKey
ALTER TABLE "result_rows" ADD CONSTRAINT "result_rows_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "result_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- append
ALTER TABLE "result_runs" ADD CONSTRAINT "result_runs_version_check" CHECK (version >= 1);
ALTER TABLE "result_rows" ADD CONSTRAINT "result_rows_rank_check" CHECK (
  (section_rank IS NULL OR section_rank >= 1) AND (class_rank IS NULL OR class_rank >= 1)
);

-- Published results are immutable: a revision is a new run, never an edit.
CREATE FUNCTION public.results_block_changes() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER result_runs_no_update_delete BEFORE UPDATE OR DELETE ON "result_runs"
  FOR EACH ROW EXECUTE FUNCTION public.results_block_changes();
CREATE TRIGGER result_rows_no_update_delete BEFORE UPDATE OR DELETE ON "result_rows"
  FOR EACH ROW EXECUTE FUNCTION public.results_block_changes();

ALTER TABLE "result_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "result_rows" ENABLE ROW LEVEL SECURITY;