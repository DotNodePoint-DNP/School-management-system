-- CreateEnum
CREATE TYPE "StaffPunchKind" AS ENUM ('IN', 'OUT');

-- CreateEnum
CREATE TYPE "StaffRequestKind" AS ENUM ('LEAVE', 'MISSED_IN', 'MISSED_OUT');

-- CreateEnum
CREATE TYPE "StaffRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "staff_attendance_policies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radius" INTEGER NOT NULL,
    "startsAt" TEXT NOT NULL,
    "endsAt" TEXT NOT NULL,
    "grace" INTEGER NOT NULL,
    "offDays" INTEGER[],
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" UUID NOT NULL,

    CONSTRAINT "staff_attendance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_punches" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "workDate" DATE NOT NULL,
    "kind" "StaffPunchKind" NOT NULL,
    "at" TIMESTAMPTZ(6) NOT NULL,
    "policyId" UUID NOT NULL,
    "distance" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "requestId" UUID,

    CONSTRAINT "staff_punches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_attendance_requests" (
    "id" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "kind" "StaffRequestKind" NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "proposedAt" TIMESTAMPTZ(6),
    "requestedBy" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "StaffRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMPTZ(6),
    "reviewedBy" UUID,
    "reviewNote" TEXT,

    CONSTRAINT "staff_attendance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_attendance_policies_createdAt_idx" ON "staff_attendance_policies"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "staff_punches_requestId_key" ON "staff_punches"("requestId");

-- CreateIndex
CREATE INDEX "staff_punches_workDate_idx" ON "staff_punches"("workDate");

-- CreateIndex
CREATE UNIQUE INDEX "staff_punches_staffId_workDate_kind_key" ON "staff_punches"("staffId", "workDate", "kind");

-- CreateIndex
CREATE INDEX "staff_attendance_requests_staffId_fromDate_toDate_idx" ON "staff_attendance_requests"("staffId", "fromDate", "toDate");

-- CreateIndex
CREATE INDEX "staff_attendance_requests_status_createdAt_idx" ON "staff_attendance_requests"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "staff_punches" ADD CONSTRAINT "staff_punches_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_punches" ADD CONSTRAINT "staff_punches_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "staff_attendance_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_punches" ADD CONSTRAINT "staff_punches_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "staff_attendance_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_requests" ADD CONSTRAINT "staff_attendance_requests_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO permissions (id, module, action)
VALUES (gen_random_uuid(), 'staff-attendance', 'review')
ON CONFLICT (module, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name = 'ADMIN' AND p.module = 'staff-attendance' AND p.action = 'review'
ON CONFLICT DO NOTHING;

ALTER TABLE staff_attendance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_punches ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_attendance_requests ENABLE ROW LEVEL SECURITY;

