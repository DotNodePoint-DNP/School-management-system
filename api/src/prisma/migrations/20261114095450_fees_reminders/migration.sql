-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "fee_reminder_runs" (
    "id" UUID NOT NULL,
    "sent_by_id" UUID NOT NULL,
    "min_days_overdue" INTEGER NOT NULL,
    "cooldown_days" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_reminder_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_reminders" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "guardian_id" UUID NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "student_count" INTEGER NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fee_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fee_reminders_guardian_id_created_at_idx" ON "fee_reminders"("guardian_id", "created_at");

-- CreateIndex
CREATE INDEX "fee_reminders_run_id_idx" ON "fee_reminders"("run_id");

-- AddForeignKey
ALTER TABLE "fee_reminders" ADD CONSTRAINT "fee_reminders_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "fee_reminder_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_reminders" ADD CONSTRAINT "fee_reminders_guardian_id_fkey" FOREIGN KEY ("guardian_id") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- appended 
ALTER TABLE "fee_reminder_runs" ADD CONSTRAINT "fee_reminder_runs_values_check" CHECK (min_days_overdue BETWEEN 1 AND 365 AND cooldown_days BETWEEN 1 AND 90);
-- A failed message always says why; the others never do.
ALTER TABLE "fee_reminders" ADD CONSTRAINT "fee_reminders_values_check" CHECK (amount > 0 AND student_count > 0 AND (status = 'FAILED') = (error IS NOT NULL));

ALTER TABLE "fee_reminder_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "fee_reminders" ENABLE ROW LEVEL SECURITY;