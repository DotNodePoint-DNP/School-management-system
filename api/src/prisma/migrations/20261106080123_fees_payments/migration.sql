-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'ESEWA', 'KHALTI', 'FONEPAY_QR');

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "receipt_no" TEXT NOT NULL,
    "fiscal_year_id" UUID NOT NULL,
    "paid_on" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "payer_guardian_id" UUID,
    "payer_name" TEXT,
    "credit_student_id" UUID,
    "received_by_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "allocated_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_reversals" (
    "payment_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "reversed_by_id" UUID NOT NULL,
    "reversed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_reversals_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "credit_refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "reason" TEXT NOT NULL,
    "approved_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_receipt_no_key" ON "payments"("receipt_no");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_fiscal_year_id_paid_on_idx" ON "payments"("fiscal_year_id", "paid_on");

-- CreateIndex
CREATE INDEX "payments_received_by_id_paid_on_idx" ON "payments"("received_by_id", "paid_on");

-- CreateIndex
CREATE INDEX "payments_credit_student_id_idx" ON "payments"("credit_student_id");

-- CreateIndex
CREATE INDEX "payments_method_reference_idx" ON "payments"("method", "reference");

-- CreateIndex
CREATE INDEX "payment_allocations_payment_id_idx" ON "payment_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "payment_allocations_invoice_id_idx" ON "payment_allocations"("invoice_id");

-- CreateIndex
CREATE INDEX "credit_refunds_payment_id_idx" ON "credit_refunds"("payment_id");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_fiscal_year_id_fkey" FOREIGN KEY ("fiscal_year_id") REFERENCES "fiscal_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_payer_guardian_id_fkey" FOREIGN KEY ("payer_guardian_id") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_credit_student_id_fkey" FOREIGN KEY ("credit_student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_refunds" ADD CONSTRAINT "credit_refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- appended 
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK (amount > 0 AND amount <= 10000000);
ALTER TABLE "payments" ADD CONSTRAINT "payments_reference_check" CHECK (
  (method = 'CASH' AND reference IS NULL) OR (method <> 'CASH' AND reference IS NOT NULL AND char_length(reference) BETWEEN 3 AND 60)
);
ALTER TABLE "payments" ADD CONSTRAINT "payments_key_check" CHECK (char_length(idempotency_key) BETWEEN 8 AND 64);
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_amount_check" CHECK (amount > 0);
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_reason_check" CHECK (char_length(reason) >= 10);
ALTER TABLE "credit_refunds" ADD CONSTRAINT "credit_refunds_amount_check" CHECK (amount > 0);
ALTER TABLE "credit_refunds" ADD CONSTRAINT "credit_refunds_reason_check" CHECK (char_length(reason) >= 10);
ALTER TABLE "credit_refunds" ADD CONSTRAINT "credit_refunds_reference_check" CHECK ((method = 'CASH') = (reference IS NULL));

-- Append-only, with the same narrow test-database exception as the invoice tables.
CREATE TRIGGER payments_append_only BEFORE UPDATE OR DELETE ON "payments" FOR EACH ROW EXECUTE FUNCTION public.ledger_block_changes();
CREATE TRIGGER payment_allocations_append_only BEFORE UPDATE OR DELETE ON "payment_allocations" FOR EACH ROW EXECUTE FUNCTION public.ledger_block_changes();
CREATE TRIGGER payment_reversals_append_only BEFORE UPDATE OR DELETE ON "payment_reversals" FOR EACH ROW EXECUTE FUNCTION public.ledger_block_changes();
CREATE TRIGGER credit_refunds_append_only BEFORE UPDATE OR DELETE ON "credit_refunds" FOR EACH ROW EXECUTE FUNCTION public.ledger_block_changes();

-- A payment must be dated inside an open fiscal year, and a cheque or transaction reference is never recorded twice
-- (unless the first payment was reversed). The lock serialises two people entering the same reference at once.
CREATE FUNCTION public.payments_insert_check() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  fy public.fiscal_years%ROWTYPE;
BEGIN
  SELECT * INTO fy FROM public.fiscal_years WHERE id = NEW.fiscal_year_id;
  IF fy.status <> 'OPEN' OR NEW.paid_on < fy.start_date OR NEW.paid_on > fy.end_date THEN
    RAISE EXCEPTION 'A payment must be dated inside an open fiscal year';
  END IF;
  IF NEW.reference IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('payref:' || NEW.method::text || ':' || NEW.reference));
    IF EXISTS (
      SELECT 1 FROM public.payments p
      WHERE p.method = NEW.method AND p.reference = NEW.reference
        AND NOT EXISTS (SELECT 1 FROM public.payment_reversals r WHERE r.payment_id = p.id)
    ) THEN
      RAISE EXCEPTION 'The % reference % has already been recorded', NEW.method::text, NEW.reference;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payments_insert_check BEFORE INSERT ON "payments" FOR EACH ROW EXECUTE FUNCTION public.payments_insert_check();

-- Per-row checks on an allocation: not onto a reversed payment, not onto a voided invoice.
CREATE FUNCTION public.payment_allocations_row_check() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.payment_reversals r WHERE r.payment_id = NEW.payment_id) THEN
    RAISE EXCEPTION 'A reversed payment cannot be applied to an invoice';
  END IF;
  IF EXISTS (SELECT 1 FROM public.invoice_voids v WHERE v.invoice_id = NEW.invoice_id) THEN
    RAISE EXCEPTION 'A voided invoice cannot be paid';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_allocations_row_check BEFORE INSERT ON "payment_allocations" FOR EACH ROW EXECUTE FUNCTION public.payment_allocations_row_check();

-- At commit: a payment never gives out more than it received, and an invoice is never paid beyond what it owes.
-- It locks both rows first, so two concurrent writers cannot both slip through.
CREATE FUNCTION public.payment_allocations_totals_check() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  pay public.payments%ROWTYPE;
  inv public.invoices%ROWTYPE;
  allocated numeric; refunded numeric; adjusted numeric; paid numeric;
BEGIN
  SELECT * INTO pay FROM public.payments WHERE id = NEW.payment_id FOR UPDATE;
  SELECT * INTO inv FROM public.invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.payment_reversals r WHERE r.payment_id = pay.id) THEN RETURN NULL; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO allocated FROM public.payment_allocations WHERE payment_id = pay.id;
  SELECT COALESCE(SUM(amount), 0) INTO refunded FROM public.credit_refunds WHERE payment_id = pay.id;
  IF allocated + refunded > pay.amount THEN
    RAISE EXCEPTION 'The payment does not have enough left to apply';
  END IF;
  IF EXISTS (SELECT 1 FROM public.invoice_voids v WHERE v.invoice_id = inv.id) THEN
    RAISE EXCEPTION 'A voided invoice cannot be paid';
  END IF;
  SELECT COALESCE(SUM(a.amount), 0) INTO adjusted
    FROM public.invoice_adjustments a JOIN public.invoice_adjustment_decisions d ON d.adjustment_id = a.id AND d.approved
    WHERE a.invoice_id = inv.id;
  SELECT COALESCE(SUM(pa.amount), 0) INTO paid
    FROM public.payment_allocations pa
    WHERE pa.invoice_id = inv.id AND NOT EXISTS (SELECT 1 FROM public.payment_reversals r WHERE r.payment_id = pa.payment_id);
  IF paid + adjusted > inv.net_amount THEN
    RAISE EXCEPTION 'This payment would be more than the invoice still owes';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER payment_allocations_totals_check AFTER INSERT ON "payment_allocations"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.payment_allocations_totals_check();

-- A payment with money handed back cannot be reversed, and a refund cannot exceed what is unapplied.
CREATE FUNCTION public.payment_reversals_check() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM public.payments WHERE id = NEW.payment_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.credit_refunds f WHERE f.payment_id = NEW.payment_id) THEN
    RAISE EXCEPTION 'A payment that has been refunded cannot be reversed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_reversals_check BEFORE INSERT ON "payment_reversals" FOR EACH ROW EXECUTE FUNCTION public.payment_reversals_check();

CREATE FUNCTION public.credit_refunds_check() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  pay public.payments%ROWTYPE;
  allocated numeric; refunded numeric;
BEGIN
  SELECT * INTO pay FROM public.payments WHERE id = NEW.payment_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.payment_reversals r WHERE r.payment_id = pay.id) THEN
    RAISE EXCEPTION 'A reversed payment holds no credit to refund';
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO allocated FROM public.payment_allocations WHERE payment_id = pay.id;
  SELECT COALESCE(SUM(amount), 0) INTO refunded FROM public.credit_refunds WHERE payment_id = pay.id;
  IF allocated + refunded + NEW.amount > pay.amount THEN
    RAISE EXCEPTION 'There is not that much unapplied credit on this payment';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER credit_refunds_check BEFORE INSERT ON "credit_refunds" FOR EACH ROW EXECUTE FUNCTION public.credit_refunds_check();

-- Void and credit-note rules now also account for payments.
CREATE OR REPLACE FUNCTION public.invoice_void_check() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM 1 FROM public.invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.invoice_adjustments a JOIN public.invoice_adjustment_decisions d ON d.adjustment_id = a.id AND d.approved
    WHERE a.invoice_id = NEW.invoice_id
  ) THEN
    RAISE EXCEPTION 'An invoice with approved adjustments cannot be voided';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payment_allocations pa
    WHERE pa.invoice_id = NEW.invoice_id AND NOT EXISTS (SELECT 1 FROM public.payment_reversals r WHERE r.payment_id = pa.payment_id)
  ) THEN
    RAISE EXCEPTION 'An invoice with payments applied cannot be voided';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.adjustment_decision_check() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  adj public.invoice_adjustments%ROWTYPE; inv public.invoices%ROWTYPE; approved_total numeric; paid numeric;
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
  SELECT COALESCE(SUM(pa.amount), 0) INTO paid
    FROM public.payment_allocations pa
    WHERE pa.invoice_id = inv.id AND NOT EXISTS (SELECT 1 FROM public.payment_reversals r WHERE r.payment_id = pa.payment_id);
  IF approved_total + paid + adj.amount > inv.net_amount THEN
    RAISE EXCEPTION 'Approved adjustments and payments would exceed the invoice amount';
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_allocations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payment_reversals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credit_refunds" ENABLE ROW LEVEL SECURITY;