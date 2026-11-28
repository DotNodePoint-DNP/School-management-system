-- CreateEnum
CREATE TYPE "PayrollAdjustmentKind" AS ENUM ('ADDITION', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "PayrollPaymentMethod" AS ENUM ('CASH', 'BANK', 'CHEQUE', 'OTHER');

-- CreateTable
CREATE TABLE "staff_salary_rates" (
    "id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "effective_month" VARCHAR(7) NOT NULL,
    "basic_paisa" INTEGER NOT NULL,
    "recorded_by" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "staff_salary_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" UUID NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "finalized_at" TIMESTAMPTZ(6),
    "finalized_by" UUID,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_entries" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "staff_no" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT,
    "basic_paisa" INTEGER,
    "partial_month" BOOLEAN NOT NULL,
    "review_note" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "payroll_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_adjustments" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "kind" "PayrollAdjustmentKind" NOT NULL,
    "label" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amount_paisa" INTEGER NOT NULL,

    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_payments" (
    "id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "amount_paisa" INTEGER NOT NULL,
    "paid_on" DATE NOT NULL,
    "method" "PayrollPaymentMethod" NOT NULL,
    "reference" TEXT,
    "recorded_by" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_by" UUID,
    "voided_at" TIMESTAMPTZ(6),
    "void_reason" TEXT,

    CONSTRAINT "payroll_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_salary_rates_staff_id_effective_month_key" ON "staff_salary_rates"("staff_id", "effective_month");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_month_key" ON "payroll_periods"("month");

-- CreateIndex
CREATE INDEX "payroll_entries_staff_id_idx" ON "payroll_entries"("staff_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_entries_period_id_staff_id_key" ON "payroll_entries"("period_id", "staff_id");

-- CreateIndex
CREATE INDEX "payroll_adjustments_entry_id_idx" ON "payroll_adjustments"("entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_payments_request_id_key" ON "payroll_payments"("request_id");

-- CreateIndex
CREATE INDEX "payroll_payments_entry_id_idx" ON "payroll_payments"("entry_id");

-- CreateIndex
CREATE INDEX "payroll_payments_paid_on_idx" ON "payroll_payments"("paid_on");

-- AddForeignKey
ALTER TABLE "staff_salary_rates" ADD CONSTRAINT "staff_salary_rates_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "payroll_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "payroll_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE staff_salary_rates ADD CHECK (basic_paisa > 0);
ALTER TABLE payroll_entries ADD CHECK (basic_paisa IS NULL OR basic_paisa > 0);
ALTER TABLE payroll_adjustments ADD CHECK (amount_paisa > 0);
ALTER TABLE payroll_payments ADD CHECK (amount_paisa > 0),
  ADD CHECK ((voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
          OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL));
ALTER TABLE payroll_periods ADD CHECK (start_date <= end_date),
  ADD CHECK ((finalized_at IS NULL) = (finalized_by IS NULL));

INSERT INTO permissions (id, module, action)
SELECT gen_random_uuid(), 'payroll', action FROM (VALUES ('read'), ('manage'), ('record-payment')) p(action)
ON CONFLICT (module,action) DO NOTHING;
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name='ADMIN' AND p.module='payroll'
ON CONFLICT DO NOTHING;

ALTER TABLE staff_salary_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_payments ENABLE ROW LEVEL SECURITY;

