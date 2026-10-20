-- CreateEnum
CREATE TYPE "StudentDocumentType" AS ENUM ('PROFILE_PHOTO', 'BIRTH_CERTIFICATE', 'TRANSFER_CERTIFICATE', 'PREVIOUS_MARKSHEET', 'OTHER');

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "photo_url" TEXT;

-- CreateTable
CREATE TABLE "student_documents" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "type" "StudentDocumentType" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "student_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "student_documents_student_id_type_idx" ON "student_documents"("student_id", "type");

-- AddForeignKey
ALTER TABLE "student_documents" ADD CONSTRAINT "student_documents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

