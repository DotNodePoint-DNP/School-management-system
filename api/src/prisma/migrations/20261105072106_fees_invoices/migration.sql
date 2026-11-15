-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('PERIODIC', 'ADMISSION', 'AD_HOC');

-- CreateEnum
CREATE TYPE "ChargeSource" AS ENUM ('STRUCTURE', 'ASSIGNMENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "AdjustmentKind" AS ENUM ('WAIVER', 'WRITE_OFF', 'CORRECTION');

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "kind" "InvoiceKind" NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "period_id" UUID,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "replaces_invoice_id" UUID,
    "description" TEXT,
    "issued_on" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "request_key" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "fee_head_id" UUID NOT NULL,
    "description_en" TEXT NOT NULL,
    "description_np" TEXT,
    "source" "ChargeSource" NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "line_discount" DECIMAL(12,2) NOT NULL,
    "invoice_discount_share" DECIMAL(12,2) NOT NULL,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "line_discount_id" UUID,
    "invoice_discount_id" UUID,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_voids" (
    "invoice_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "voided_by_id" UUID NOT NULL,
    "voided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_voids_pkey" PRIMARY KEY ("invoice_id")
);

-- CreateTable
CREATE TABLE "invoice_adjustments" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "kind" "AdjustmentKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_adjustment_decisions" (
    "adjustment_id" UUID NOT NULL,
    "approved" BOOLEAN NOT NULL,
    "decided_by_id" UUID NOT NULL,
    "note" TEXT,
    "decided_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_adjustment_decisions_pkey" PRIMARY KEY ("adjustment_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_replaces_invoice_id_key" ON "invoices"("replaces_invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_request_key_key" ON "invoices"("request_key");

-- CreateIndex
CREATE INDEX "invoices_enrollment_id_idx" ON "invoices"("enrollment_id");

-- CreateIndex
CREATE INDEX "invoices_student_id_idx" ON "invoices"("student_id");

-- CreateIndex
CREATE INDEX "invoices_period_id_idx" ON "invoices"("period_id");

-- CreateIndex
CREATE INDEX "invoices_fiscal_year_id_issued_on_idx" ON "invoices"("fiscal_year_id", "issued_on");

-- CreateIndex
CREATE INDEX "invoice_lines_invoice_id_idx" ON "invoice_lines"("invoice_id");

-- CreateIndex
CREATE INDEX "invoice_lines_fee_head_id_idx" ON "invoice_lines"("fee_head_id");

-- CreateIndex
CREATE INDEX "invoice_adjustments_invoice_id_idx" ON "invoice_adjustments"("invoice_id");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_enrollment_id_academic_year_id_fkey" FOREIGN KEY ("enrollment_id", "academic_year_id") REFERENCES "enrollments"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "billing_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_replaces_invoice_id_fkey" FOREIGN KEY ("replaces_invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_fee_head_id_fkey" FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_line_discount_id_fkey" FOREIGN KEY ("line_discount_id") REFERENCES "student_discounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_discount_id_fkey" FOREIGN KEY ("invoice_discount_id") REFERENCES "student_discounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_voids" ADD CONSTRAINT "invoice_voids_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_adjustment_decisions" ADD CONSTRAINT "invoice_adjustment_decisions_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "invoice_adjustments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- appended 
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amounts_check" CHECK (
  gross_amount > 0 AND discount_amount >= 0 AND net_amount > 0 AND net_amount = gross_amount - discount_amount AND net_amount <= 100000000
);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_kind_check" CHECK ((kind = 'PERIODIC') = (period_id IS NOT NULL));
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_revision_check" CHECK (revision >= 1 AND ((replaces_invoice_id IS NULL) = (revision = 1)));
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_amounts_check" CHECK (
  gross_amount > 0 AND line_discount >= 0 AND invoice_discount_share >= 0 AND net_amount >= 0
  AND net_amount = gross_amount - line_discount - invoice_discount_share
);
ALTER TABLE "invoice_adjustments" ADD CONSTRAINT "invoice_adjustments_amount_check" CHECK (amount > 0);

-- One invoice per student per period (and per revision), and one admission invoice per student.
CREATE UNIQUE INDEX "invoices_one_periodic" ON "invoices" (enrollment_id, period_id, revision) WHERE kind = 'PERIODIC';
CREATE UNIQUE INDEX "invoices_one_admission" ON "invoices" (enrollment_id, revision) WHERE kind = 'ADMISSION';

-- Append-only. Deleting is refused, except inside a throwaway test database that has opted in (see the guide).
CREATE FUNCTION public.ledger_block_changes() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND pg_catalog.current_setting('app.environment', true) = 'test'
     AND pg_catalog.current_setting('app.allow_ledger_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER invoices_append_only BEFORE UPDATE OR DELETE ON "invoices" FOR EACH ROW EXECUTE FUNCTION public.ledger_block_changes();
CREATE TRIGGER invoice_lines_append_only BEFORE UPDATE OR DELETE ON "invoice_lines" FOR EACH ROW EXECUTE FUNCTION public.ledger_block_changes();
CREATE TRIGGER invoice_voids_append_only BEFORE UPDATE OR DELETE ON "invoice_voids" FOR EACH ROW EXECUTE FUNCTION public.ledger_block_changes();
CREATE TRIGGER invoice_adjustments_append_only BEFORE UPDATE OR DELETE ON "invoice_adjustments" FOR EACH ROW EXECUTE FUNCTION public.ledger_block_changes();
CREATE TRIGGER invoice_adjustment_decisions_append_only BEFORE UPDATE OR DELETE ON "invoice_adjustment_decisions" FOR EACH ROW EXECUTE FUNCTION public.ledger_block_changes();

-- At commit, an invoice's totals must equal the sum of its lines, and it must have lines.
CREATE FUNCTION public.invoice_totals_check() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  inv_id uuid; g numeric; d numeric; n numeric; cnt integer; sg numeric; sd numeric; sn numeric;
BEGIN
  IF TG_TABLE_NAME = 'invoices' THEN inv_id := NEW.id; ELSE inv_id := NEW.invoice_id; END IF;
  SELECT gross_amount, discount_amount, net_amount INTO g, d, n FROM public.invoices WHERE id = inv_id;
  SELECT COUNT(*), COALESCE(SUM(gross_amount), 0), COALESCE(SUM(line_discount + invoice_discount_share), 0), COALESCE(SUM(net_amount), 0)
    INTO cnt, sg, sd, sn FROM public.invoice_lines WHERE invoice_id = inv_id;
  IF cnt = 0 OR g <> sg OR d <> sd OR n <> sn THEN
    RAISE EXCEPTION 'Invoice % does not match the total of its lines', inv_id;
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER invoices_totals_check AFTER INSERT ON "invoices" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.invoice_totals_check();
CREATE CONSTRAINT TRIGGER invoice_lines_totals_check AFTER INSERT ON "invoice_lines" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.invoice_totals_check();

-- A credit note needs a different approver, a live invoice, and may never exceed the invoice amount in total.
CREATE FUNCTION public.adjustment_decision_check() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  adj public.invoice_adjustments%ROWTYPE; inv public.invoices%ROWTYPE; approved_total numeric;
BEGIN
  IF NOT NEW.approved THEN RETURN NEW; END IF;
  SELECT * INTO adj FROM public.invoice_adjustments WHERE id = NEW.adjustment_id;
  IF NEW.decided_by_id = adj.requested_by_id THEN
    RAISE EXCEPTION 'An adjustment must be approved by someone other than the person who requested it';
  END IF;
  SELECT * INTO inv FROM public.invoices WHERE id = adj.invoice_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.invoice_voids v WHERE v.invoice_id = inv.id) THEN
    RAISE EXCEPTION 'A voided invoice cannot be adjusted';
  END IF;
  SELECT COALESCE(SUM(a.amount), 0) INTO approved_total
    FROM public.invoice_adjustments a JOIN public.invoice_adjustment_decisions d ON d.adjustment_id = a.id AND d.approved
    WHERE a.invoice_id = inv.id;
  IF approved_total + adj.amount > inv.net_amount THEN
    RAISE EXCEPTION 'Approved adjustments would exceed the invoice amount';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invoice_adjustment_decisions_check BEFORE INSERT ON "invoice_adjustment_decisions" FOR EACH ROW EXECUTE FUNCTION public.adjustment_decision_check();

-- An invoice with approved credit notes cannot be voided (payments will be added to this rule).
CREATE FUNCTION public.invoice_void_check() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.invoice_adjustments a JOIN public.invoice_adjustment_decisions d ON d.adjustment_id = a.id AND d.approved
    WHERE a.invoice_id = NEW.invoice_id
  ) THEN
    RAISE EXCEPTION 'An invoice with approved adjustments cannot be voided';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER invoice_voids_check BEFORE INSERT ON "invoice_voids" FOR EACH ROW EXECUTE FUNCTION public.invoice_void_check();

ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_voids" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "invoice_adjustment_decisions" ENABLE ROW LEVEL SECURITY;