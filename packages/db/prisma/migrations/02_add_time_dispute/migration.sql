-- AlterTable
ALTER TABLE "time_entry" ADD COLUMN     "disputed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dispute_reason" TEXT,
ADD COLUMN     "disputed_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "time_entry_disputed_idx" ON "time_entry"("disputed");
