-- CreateTable
CREATE TABLE "day_closes" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "version" INTEGER NOT NULL,
    "expected_cash" DECIMAL(12,2) NOT NULL,
    "counted_cash" DECIMAL(12,2) NOT NULL,
    "cash_paid_out" DECIMAL(12,2) NOT NULL,
    "variance" DECIMAL(12,2) NOT NULL,
    "receipt_count" INTEGER NOT NULL,
    "method_totals" JSONB NOT NULL,
    "note" TEXT,
    "closed_by_id" UUID NOT NULL,
    "closed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "day_closes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "day_close_lines" (
    "day_close_id" UUID NOT NULL,
    "cashier_id" UUID NOT NULL,
    "expected_cash" DECIMAL(12,2) NOT NULL,
    "counted_cash" DECIMAL(12,2) NOT NULL,
    "variance" DECIMAL(12,2) NOT NULL,
    "note" TEXT,

    CONSTRAINT "day_close_lines_pkey" PRIMARY KEY ("day_close_id","cashier_id")
);

-- CreateTable
CREATE TABLE "day_close_reopens" (
    "day_close_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "reopened_by_id" UUID NOT NULL,
    "reopened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "day_close_reopens_pkey" PRIMARY KEY ("day_close_id")
);

-- CreateIndex
CREATE INDEX "day_closes_date_idx" ON "day_closes"("date");

-- CreateIndex
CREATE UNIQUE INDEX "day_closes_date_version_key" ON "day_closes"("date", "version");

-- AddForeignKey
ALTER TABLE "day_close_lines" ADD CONSTRAINT "day_close_lines_day_close_id_fkey" FOREIGN KEY ("day_close_id") REFERENCES "day_closes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "day_close_reopens" ADD CONSTRAINT "day_close_reopens_day_close_id_fkey" FOREIGN KEY ("day_close_id") REFERENCES "day_closes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- appended
ALTER TABLE "day_closes" ADD CONSTRAINT "day_closes_amounts_check" CHECK (
  version >= 1 AND counted_cash >= 0 AND cash_paid_out >= 0 AND receipt_count >= 0 AND variance = counted_cash - expected_cash
);
ALTER TABLE "day_close_lines" ADD CONSTRAINT "day_close_lines_amounts_check" CHECK (
  expected_cash >= 0 AND counted_cash >= 0 AND variance = counted_cash - expected_cash
);
ALTER TABLE "day_close_reopens" ADD CONSTRAINT "day_close_reopens_reason_check" CHECK (char_length(reason) >= 10);

CREATE TRIGGER day_closes_append_only BEFORE UPDATE OR DELETE ON "day_closes" FOR EACH ROW EXECUTE FUNCTION public.ledger_block_changes();
CREATE TRIGGER day_close_lines_append_only BEFORE UPDATE OR DELETE ON "day_close_lines" FOR EACH ROW EXECUTE FUNCTION public.ledger_block_changes();
CREATE TRIGGER day_close_reopens_append_only BEFORE UPDATE OR DELETE ON "day_close_reopens" FOR EACH ROW EXECUTE FUNCTION public.ledger_block_changes();

-- A date is closed when its latest close has not been reopened.
CREATE FUNCTION public.day_is_closed(d date) RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.day_closes c
    WHERE c.date = d AND NOT EXISTS (SELECT 1 FROM public.day_close_reopens r WHERE r.day_close_id = c.id)
  )
$$;

-- One active close per date, numbered in order, for a day that has happened, inside an open fiscal year.
CREATE FUNCTION public.day_closes_insert_check() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('day:' || pg_catalog.to_char(NEW.date, 'YYYY-MM-DD')));
  IF NEW.date > (pg_catalog.now() AT TIME ZONE 'Asia/Kathmandu')::date THEN
    RAISE EXCEPTION 'A day that has not happened yet cannot be closed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fiscal_years f WHERE f.status = 'OPEN' AND NEW.date BETWEEN f.start_date AND f.end_date) THEN
    RAISE EXCEPTION 'A day can only be closed inside an open fiscal year';
  END IF;
  IF public.day_is_closed(NEW.date) THEN
    RAISE EXCEPTION 'This day is already closed';
  END IF;
  IF NEW.version <> (SELECT COALESCE(MAX(c.version), 0) + 1 FROM public.day_closes c WHERE c.date = NEW.date) THEN
    RAISE EXCEPTION 'The close version must follow the previous one';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER day_closes_insert_check BEFORE INSERT ON "day_closes" FOR EACH ROW EXECUTE FUNCTION public.day_closes_insert_check();

-- A receipt cannot be dated inside a closed day. (This replaces the 7C function and adds that one check.)
CREATE OR REPLACE FUNCTION public.payments_insert_check() RETURNS trigger
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
  IF public.day_is_closed(NEW.paid_on) THEN
    RAISE EXCEPTION 'The collection for % has been closed', NEW.paid_on;
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

-- Reversals and refunds move cash on the day they happen, so that day must be open.
CREATE FUNCTION public.cash_movement_day_check() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF public.day_is_closed((pg_catalog.now() AT TIME ZONE 'Asia/Kathmandu')::date) THEN
    RAISE EXCEPTION 'Today''s collection has been closed. Reopen the day first.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER payment_reversals_day_check BEFORE INSERT ON "payment_reversals" FOR EACH ROW EXECUTE FUNCTION public.cash_movement_day_check();
CREATE TRIGGER credit_refunds_day_check BEFORE INSERT ON "credit_refunds" FOR EACH ROW EXECUTE FUNCTION public.cash_movement_day_check();

ALTER TABLE "day_closes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "day_close_lines" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "day_close_reopens" ENABLE ROW LEVEL SECURITY;