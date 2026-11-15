-- CreateEnum
CREATE TYPE "FiscalYearStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "FeeFrequency" AS ENUM ('ONE_TIME', 'MONTHLY', 'TERMLY', 'YEARLY', 'AD_HOC');

-- CreateEnum
CREATE TYPE "FeeAudience" AS ENUM ('ALL', 'NEW', 'CONTINUING');

-- CreateTable
CREATE TABLE "fiscal_years" (
    "id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "FiscalYearStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMPTZ(6),
    "closed_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fiscal_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_heads" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_np" TEXT,
    "frequency" "FeeFrequency" NOT NULL,
    "per_student" BOOLEAN NOT NULL DEFAULT false,
    "income_account_code" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fee_heads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_periods" (
    "id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "name_np" TEXT,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "billing_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structure_lines" (
    "id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "fee_head_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "audience" "FeeAudience" NOT NULL DEFAULT 'ALL',
    "on_admission" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_structure_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_structure_line_periods" (
    "line_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,

    CONSTRAINT "fee_structure_line_periods_pkey" PRIMARY KEY ("line_id","period_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_years_label_key" ON "fiscal_years"("label");

-- CreateIndex
CREATE UNIQUE INDEX "fee_heads_code_key" ON "fee_heads"("code");

-- CreateIndex
CREATE UNIQUE INDEX "billing_periods_academic_year_id_sequence_key" ON "billing_periods"("academic_year_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "billing_periods_academic_year_id_name_key" ON "billing_periods"("academic_year_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "billing_periods_id_academic_year_id_key" ON "billing_periods"("id", "academic_year_id");

-- CreateIndex
CREATE INDEX "fee_structure_lines_academic_year_id_class_id_idx" ON "fee_structure_lines"("academic_year_id", "class_id");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structure_lines_academic_year_id_class_id_fee_head_id_a_key" ON "fee_structure_lines"("academic_year_id", "class_id", "fee_head_id", "audience");

-- CreateIndex
CREATE UNIQUE INDEX "fee_structure_lines_id_academic_year_id_key" ON "fee_structure_lines"("id", "academic_year_id");

-- CreateIndex
CREATE INDEX "fee_structure_line_periods_period_id_idx" ON "fee_structure_line_periods"("period_id");

-- AddForeignKey
ALTER TABLE "billing_periods" ADD CONSTRAINT "billing_periods_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_lines" ADD CONSTRAINT "fee_structure_lines_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_lines" ADD CONSTRAINT "fee_structure_lines_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_lines" ADD CONSTRAINT "fee_structure_lines_fee_head_id_fkey" FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_line_periods" ADD CONSTRAINT "fee_structure_line_periods_line_id_academic_year_id_fkey" FOREIGN KEY ("line_id", "academic_year_id") REFERENCES "fee_structure_lines"("id", "academic_year_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_structure_line_periods" ADD CONSTRAINT "fee_structure_line_periods_period_id_academic_year_id_fkey" FOREIGN KEY ("period_id", "academic_year_id") REFERENCES "billing_periods"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- appended
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_dates_check" CHECK (end_date > start_date);
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_closed_check" CHECK ((status = 'CLOSED') = (closed_at IS NOT NULL));
-- Two fiscal years can never share a day.
ALTER TABLE "fiscal_years" ADD CONSTRAINT "fiscal_years_no_overlap"
  EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&);

ALTER TABLE "fee_heads" ADD CONSTRAINT "fee_heads_code_check" CHECK (code ~ '^[A-Z0-9_]{2,20}$');
ALTER TABLE "fee_heads" ADD CONSTRAINT "fee_heads_shape_check" CHECK (NOT (per_student AND frequency = 'AD_HOC'));

ALTER TABLE "billing_periods" ADD CONSTRAINT "billing_periods_dates_check" CHECK (end_date >= start_date AND due_date >= start_date);
-- Periods of one academic year never overlap.
ALTER TABLE "billing_periods" ADD CONSTRAINT "billing_periods_no_overlap"
  EXCLUDE USING gist (academic_year_id WITH =, daterange(start_date, end_date, '[]') WITH &&);

ALTER TABLE "fee_structure_lines" ADD CONSTRAINT "fee_structure_lines_amount_check" CHECK (amount > 0 AND amount <= 10000000);
-- An admission line is for new students only.
ALTER TABLE "fee_structure_lines" ADD CONSTRAINT "fee_structure_lines_admission_check" CHECK (NOT on_admission OR audience = 'NEW');

ALTER TABLE "fiscal_years" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_heads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "billing_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_structure_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_structure_line_periods" ENABLE ROW LEVEL SECURITY;