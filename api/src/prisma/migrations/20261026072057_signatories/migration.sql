-- CreateEnum
CREATE TYPE "SignatoryRole" AS ENUM ('PRINCIPAL', 'EXAM_CONTROLLER', 'ACCOUNTANT', 'OTHER');

-- CreateEnum
CREATE TYPE "SignatureMode" AS ENUM ('DIGITAL', 'LINE');

-- AlterTable
ALTER TABLE "staff" ADD COLUMN     "signature_file_id" UUID,
ADD COLUMN     "signature_mode" "SignatureMode" NOT NULL DEFAULT 'LINE';

-- CreateTable
CREATE TABLE "signatories" (
    "id" UUID NOT NULL,
    "role" "SignatoryRole" NOT NULL,
    "role_label" TEXT,
    "slot" TEXT NOT NULL,
    "full_name_en" TEXT NOT NULL,
    "full_name_np" TEXT,
    "designation_en" TEXT NOT NULL,
    "designation_np" TEXT,
    "staff_id" UUID,
    "mode" "SignatureMode" NOT NULL DEFAULT 'LINE',
    "signature_file_id" UUID,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "signatories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "signatories_slot_valid_from_idx" ON "signatories"("slot", "valid_from");

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_signature_file_id_fkey" FOREIGN KEY ("signature_file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatories" ADD CONSTRAINT "signatories_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatories" ADD CONSTRAINT "signatories_signature_file_id_fkey" FOREIGN KEY ("signature_file_id") REFERENCES "stored_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- appended 
ALTER TABLE "signatories" ADD CONSTRAINT "signatories_dates_check" CHECK (valid_to IS NULL OR valid_to >= valid_from);
ALTER TABLE "signatories" ADD CONSTRAINT "signatories_label_check" CHECK ((role = 'OTHER') = (role_label IS NOT NULL));
ALTER TABLE "signatories" ADD CONSTRAINT "signatories_slot_check"
  CHECK (slot = CASE WHEN role = 'OTHER' THEN 'OTHER:' || lower(role_label) ELSE role::text END);
-- Digital signing needs an image.
ALTER TABLE "signatories" ADD CONSTRAINT "signatories_mode_check" CHECK (mode = 'LINE' OR signature_file_id IS NOT NULL);
ALTER TABLE "staff" ADD CONSTRAINT "staff_signature_mode_check" CHECK (signature_mode = 'LINE' OR signature_file_id IS NOT NULL);
-- One holder per role at any time (an open end date means "until further notice").
ALTER TABLE "signatories" ADD CONSTRAINT "signatories_no_overlap"
  EXCLUDE USING gist (slot WITH =, daterange(valid_from, valid_to, '[]') WITH &&);

ALTER TABLE "signatories" ENABLE ROW LEVEL SECURITY;