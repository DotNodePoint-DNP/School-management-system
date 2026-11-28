BEGIN;
ALTER TYPE "PayrollPaymentMethod" ADD VALUE IF NOT EXISTS 'WALLET';
CREATE TYPE "PayrollLeaveMode" AS ENUM ('NONE','AUTO','OVERRIDE');

CREATE TABLE payroll_preferences (
  staff_id uuid PRIMARY KEY REFERENCES staff(id) ON DELETE CASCADE ON UPDATE CASCADE,
  method "PayrollPaymentMethod" NOT NULL,
  account_ref text
);
ALTER TABLE payroll_entries ADD COLUMN total_days integer,
  ADD COLUMN present_days integer,
  ADD COLUMN leave_mode "PayrollLeaveMode" NOT NULL DEFAULT 'NONE',
  ADD COLUMN leave_override_paisa integer,
  ADD COLUMN supplemental_draft boolean NOT NULL DEFAULT false,
  ADD CHECK (total_days IS NULL OR total_days BETWEEN 1 AND 32),
  ADD CHECK (present_days IS NULL OR (total_days IS NOT NULL AND present_days BETWEEN 0 AND total_days)),
  ADD CHECK (leave_mode <> 'AUTO' OR present_days IS NOT NULL),
  ADD CHECK ((leave_mode = 'OVERRIDE') = (leave_override_paisa IS NOT NULL)),
  ADD CHECK (leave_override_paisa >= 0);

CREATE TABLE salary_advances (
  id uuid PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE,
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  issued_on date NOT NULL,
  amount_paisa integer NOT NULL CHECK (amount_paisa > 0),
  note text NOT NULL,
  recorded_by uuid NOT NULL,
  recorded_at timestamptz(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  settled_entry_id uuid REFERENCES payroll_entries(id) ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX salary_advances_staff_id_issued_on_idx ON salary_advances(staff_id,issued_on);
CREATE INDEX salary_advances_settled_entry_id_idx ON salary_advances(settled_entry_id);
ALTER TABLE payroll_adjustments ADD COLUMN advance_id uuid REFERENCES salary_advances(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN deferred boolean NOT NULL DEFAULT false,
  ADD CHECK (advance_id IS NULL OR kind='DEDUCTION'),
  ADD CHECK (NOT deferred OR advance_id IS NOT NULL);
CREATE UNIQUE INDEX payroll_adjustments_entry_id_advance_id_key ON payroll_adjustments(entry_id,advance_id);
ALTER TABLE payroll_payments ADD COLUMN transfer_id uuid;
CREATE UNIQUE INDEX payroll_payments_transfer_id_entry_id_key ON payroll_payments(transfer_id,entry_id);
ALTER TABLE payroll_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_advances ENABLE ROW LEVEL SECURITY;
INSERT INTO permissions(id,module,action) VALUES(gen_random_uuid(),'payroll','unlock') ON CONFLICT(module,action) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name='ADMIN' AND p.module='payroll' AND p.action='unlock'
ON CONFLICT DO NOTHING;
COMMIT;
