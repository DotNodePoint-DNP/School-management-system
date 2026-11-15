-- CreateEnum
CREATE TYPE "DiscountCategory" AS ENUM ('MERIT_SCHOLARSHIP', 'NEED_SCHOLARSHIP', 'SIBLING', 'STAFF_CHILD', 'MANAGEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED_OFF', 'PRICE_OVERRIDE');

-- CreateEnum
CREATE TYPE "DiscountStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

-- CreateTable
CREATE TABLE "student_fee_assignments" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "fee_head_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_fee_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_fee_assignment_periods" (
    "assignment_id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "fee_head_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,

    CONSTRAINT "student_fee_assignment_periods_pkey" PRIMARY KEY ("assignment_id","period_id")
);

-- CreateTable
CREATE TABLE "student_discounts" (
    "id" UUID NOT NULL,
    "enrollment_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "category" "DiscountCategory" NOT NULL,
    "fee_head_id" UUID,
    "type" "DiscountType" NOT NULL,
    "value" DECIMAL(12,2) NOT NULL,
    "from_period_id" UUID,
    "to_period_id" UUID,
    "reason" TEXT NOT NULL,
    "status" "DiscountStatus" NOT NULL DEFAULT 'PENDING',
    "created_by_id" UUID NOT NULL,
    "last_edited_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "rejected_by_id" UUID,
    "rejected_at" TIMESTAMPTZ(6),
    "reject_reason" TEXT,
    "revoked_by_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "revoke_reason" TEXT,

    CONSTRAINT "student_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_fee_assignments_enrollment_id_idx" ON "student_fee_assignments"("enrollment_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_fee_assignments_id_enrollment_id_fee_head_id_key" ON "student_fee_assignments"("id", "enrollment_id", "fee_head_id");

-- CreateIndex
CREATE INDEX "student_fee_assignment_periods_period_id_idx" ON "student_fee_assignment_periods"("period_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_fee_assignment_periods_enrollment_id_fee_head_id_pe_key" ON "student_fee_assignment_periods"("enrollment_id", "fee_head_id", "period_id");

-- CreateIndex
CREATE INDEX "student_discounts_enrollment_id_status_idx" ON "student_discounts"("enrollment_id", "status");

-- CreateIndex
CREATE INDEX "student_discounts_status_created_at_idx" ON "student_discounts"("status", "created_at");

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_fee_head_id_fkey" FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignment_periods" ADD CONSTRAINT "student_fee_assignment_periods_assignment_id_enrollment_id_fkey" FOREIGN KEY ("assignment_id", "enrollment_id", "fee_head_id") REFERENCES "student_fee_assignments"("id", "enrollment_id", "fee_head_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignment_periods" ADD CONSTRAINT "student_fee_assignment_periods_enrollment_id_academic_year_fkey" FOREIGN KEY ("enrollment_id", "academic_year_id") REFERENCES "enrollments"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_fee_assignment_periods" ADD CONSTRAINT "student_fee_assignment_periods_period_id_academic_year_id_fkey" FOREIGN KEY ("period_id", "academic_year_id") REFERENCES "billing_periods"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_enrollment_id_academic_year_id_fkey" FOREIGN KEY ("enrollment_id", "academic_year_id") REFERENCES "enrollments"("id", "academic_year_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_fee_head_id_fkey" FOREIGN KEY ("fee_head_id") REFERENCES "fee_heads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_from_period_id_fkey" FOREIGN KEY ("from_period_id") REFERENCES "billing_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_to_period_id_fkey" FOREIGN KEY ("to_period_id") REFERENCES "billing_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- appended
ALTER TABLE "student_fee_assignments" ADD CONSTRAINT "student_fee_assignments_amount_check" CHECK (amount > 0 AND amount <= 10000000);

ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_value_check" CHECK (
  (type = 'PERCENT' AND value > 0 AND value <= 100)
  OR (type = 'FIXED_OFF' AND value > 0 AND value <= 10000000)
  OR (type = 'PRICE_OVERRIDE' AND value >= 0 AND value <= 10000000)
);
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_override_head_check" CHECK (type <> 'PRICE_OVERRIDE' OR fee_head_id IS NOT NULL);

-- Each status carries exactly the fields it needs.
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_status_check" CHECK (
  (status = 'PENDING' AND approved_by_id IS NULL AND rejected_by_id IS NULL AND revoked_by_id IS NULL)
  OR (status = 'APPROVED' AND approved_by_id IS NOT NULL AND approved_at IS NOT NULL AND rejected_by_id IS NULL AND revoked_by_id IS NULL)
  OR (status = 'REJECTED' AND rejected_by_id IS NOT NULL AND rejected_at IS NOT NULL AND reject_reason IS NOT NULL AND approved_by_id IS NULL)
  OR (status = 'REVOKED' AND approved_by_id IS NOT NULL AND revoked_by_id IS NOT NULL AND revoked_at IS NOT NULL AND revoke_reason IS NOT NULL)
);

-- Two people: whoever created or last edited a discount can never be the one who approved it.
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_two_person_check"
  CHECK (approved_by_id IS NULL OR (approved_by_id <> created_by_id AND approved_by_id <> last_edited_by_id));

ALTER TABLE "student_fee_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_fee_assignment_periods" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_discounts" ENABLE ROW LEVEL SECURITY;