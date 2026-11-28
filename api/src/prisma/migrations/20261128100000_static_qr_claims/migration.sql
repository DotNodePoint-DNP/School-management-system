BEGIN;
-- CreateEnum
CREATE TYPE "QrClaimStatus" AS ENUM ('PENDING', 'CLARIFICATION', 'REJECTED', 'APPROVED');

-- CreateTable
CREATE TABLE "school_qrs" (
    "id" UUID NOT NULL,
    "merchant" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "image" BYTEA NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_qrs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_claims" (
    "id" UUID NOT NULL,
    "requestKey" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "guardianId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "submittedBy" UUID NOT NULL,
    "qrId" UUID NOT NULL,
    "transferredOn" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "QrClaimStatus" NOT NULL DEFAULT 'PENDING',
    "paymentId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QrClaimAllocation" (
    "claimId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "QrClaimAllocation_pkey" PRIMARY KEY ("claimId","invoiceId")
);

-- CreateTable
CREATE TABLE "QrClaimEvent" (
    "id" UUID NOT NULL,
    "claimId" UUID NOT NULL,
    "actorId" UUID NOT NULL,
    "status" "QrClaimStatus" NOT NULL,
    "reference" TEXT,
    "note" TEXT,
    "image" BYTEA,
    "hasImage" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QrClaimEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "qr_claims_requestKey_key" ON "qr_claims"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "qr_claims_paymentId_key" ON "qr_claims"("paymentId");

-- CreateIndex
CREATE INDEX "qr_claims_status_createdAt_idx" ON "qr_claims"("status", "createdAt");

-- CreateIndex
CREATE INDEX "qr_claims_guardianId_studentId_createdAt_idx" ON "qr_claims"("guardianId", "studentId", "createdAt");

-- CreateIndex
CREATE INDEX "QrClaimEvent_claimId_createdAt_idx" ON "QrClaimEvent"("claimId", "createdAt");

-- AddForeignKey
ALTER TABLE "qr_claims" ADD CONSTRAINT "qr_claims_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_claims" ADD CONSTRAINT "qr_claims_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_claims" ADD CONSTRAINT "qr_claims_qrId_fkey" FOREIGN KEY ("qrId") REFERENCES "school_qrs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_claims" ADD CONSTRAINT "qr_claims_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrClaimAllocation" ADD CONSTRAINT "QrClaimAllocation_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "qr_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrClaimAllocation" ADD CONSTRAINT "QrClaimAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QrClaimEvent" ADD CONSTRAINT "QrClaimEvent_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "qr_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;


CREATE UNIQUE INDEX school_qrs_one_active ON school_qrs(active) WHERE active;
ALTER TABLE qr_claims ADD CONSTRAINT qr_claim_posted CHECK ((status='APPROVED') = ("paymentId" IS NOT NULL)), ADD CHECK (amount > 0);
ALTER TABLE "QrClaimAllocation" ADD CHECK (amount > 0);
INSERT INTO permissions (id,module,action) VALUES (gen_random_uuid(),'fees','qr-review'),(gen_random_uuid(),'fees','qr-manage') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions (role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name='ADMIN' AND p.module='fees' AND p.action IN ('qr-review','qr-manage') ON CONFLICT DO NOTHING;
ALTER TABLE school_qrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QrClaimAllocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "QrClaimEvent" ENABLE ROW LEVEL SECURITY;
CREATE INDEX "QrClaimEvent_reference_idx" ON "QrClaimEvent"(reference);
COMMIT;
