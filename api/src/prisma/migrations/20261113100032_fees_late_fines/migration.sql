-- CreateEnum
CREATE TYPE "LateFeeType" AS ENUM ('FIXED', 'PERCENT');

-- CreateTable
CREATE TABLE "late_fee_policies" (
    "id" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "type" "LateFeeType" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "grace_days" INTEGER NOT NULL,
    "min_outstanding" DECIMAL(12,2) NOT NULL,
    "max_fine" DECIMAL(12,2),
    "fine_admission" BOOLEAN NOT NULL DEFAULT false,
    "applies_from_due_date" DATE NOT NULL,
    "fee_head_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "late_fee_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "late_fine_runs" (
    "id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "as_of" DATE NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "late_fine_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "late_fines" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "source_invoice_id" UUID NOT NULL,
    "fine_invoice_id" UUID NOT NULL,
    "base_amount" DECIMAL(12,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "days_overdue" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "late_fines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "late_fee_policies_created_at_idx" ON "late_fee_policies"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "late_fines_source_invoice_id_key" ON "late_fines"("source_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "late_fines_fine_invoice_id_key" ON "late_fines"("fine_invoice_id");

-- CreateIndex
CREATE INDEX "late_fines_run_id_idx" ON "late_fines"("run_id");

-- AddForeignKey
ALTER TABLE "late_fee_policies" ADD CONSTRAINT "late_fee_policies_fee_head_id_fkey" FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "late_fine_runs" ADD CONSTRAINT "late_fine_runs_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "late_fee_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "late_fines" ADD CONSTRAINT "late_fines_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "late_fine_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "late_fines" ADD CONSTRAINT "late_fines_source_invoice_id_fkey" FOREIGN KEY ("source_invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "late_fines" ADD CONSTRAINT "late_fines_fine_invoice_id_fkey" FOREIGN KEY ("fine_invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- appended
ALTER TABLE "late_fee_policies" ADD CONSTRAINT "late_fee_policies_values_check" CHECK (
  value > 0 AND value <= 1000000 AND (type <> 'PERCENT' OR value <= 100)
  AND grace_days BETWEEN 0 AND 365 AND min_outstanding >= 0 AND (max_fine IS NULL OR max_fine > 0)
);
ALTER TABLE "late_fines" ADD CONSTRAINT "late_fines_amounts_check" CHECK (amount > 0 AND base_amount > 0 AND days_overdue >= 1);

CREATE TRIGGER late_fee_policies_append_only BEFORE UPDATE OR DELETE ON "late_fee_policies" FOR EACH ROW EXECUTE FUNCTION public.ledger_block_changes();
CREATE TRIGGER late_fine_runs_append_only BEFORE UPDATE OR DELETE ON "late_fine_runs" FOR EACH ROW EXECUTE FUNCTION public.ledger_block_changes();
CREATE TRIGGER late_fines_append_only BEFORE UPDATE OR DELETE ON "late_fines" FOR EACH ROW EXECUTE FUNCTION public.ledger_block_changes();

-- A fine must be a fine invoice for the same student and amount, charged on a live regular invoice.
-- Ad-hoc invoices (which includes fines) can never be the source, so a fine is never fined.
CREATE FUNCTION public.late_fines_insert_check() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  src public.invoices%ROWTYPE;
  fine public.invoices%ROWTYPE;
BEGIN
  SELECT * INTO src FROM public.invoices WHERE id = NEW.source_invoice_id FOR UPDATE;
  SELECT * INTO fine FROM public.invoices WHERE id = NEW.fine_invoice_id;
  IF src.kind = 'AD_HOC' THEN
    RAISE EXCEPTION 'Ad-hoc invoices and fines are never fined';
  END IF;
  IF EXISTS (SELECT 1 FROM public.invoice_voids v WHERE v.invoice_id = src.id) THEN
    RAISE EXCEPTION 'A voided invoice cannot be fined';
  END IF;
  IF fine.kind <> 'AD_HOC' OR fine.period_id IS NOT NULL OR fine.student_id <> src.student_id OR fine.net_amount <> NEW.amount THEN
    RAISE EXCEPTION 'The fine invoice does not match the fine';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER late_fines_insert_check BEFORE INSERT ON "late_fines" FOR EACH ROW EXECUTE FUNCTION public.late_fines_insert_check();

ALTER TABLE "late_fee_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "late_fine_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "late_fines" ENABLE ROW LEVEL SECURITY;