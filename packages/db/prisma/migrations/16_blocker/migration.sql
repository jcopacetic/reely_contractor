-- Blockers: a stalled-work flag on a contract. While open, billable clock is paused (the [created_at,
-- resolved_at] interval is the paused window). Additive; the billing/timer exclusion ties in later.

-- CreateEnum
CREATE TYPE "BlockerStatus" AS ENUM ('open', 'resolved');

-- CreateTable
CREATE TABLE "blocker" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "sprint_id" UUID,
    "status" "BlockerStatus" NOT NULL DEFAULT 'open',
    "reason" TEXT NOT NULL,
    "raised_by_role" TEXT NOT NULL,
    "raised_by_user_id" TEXT NOT NULL,
    "resolution_note" TEXT,
    "resolved_by_role" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "blocker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blocker_contract_id_status_idx" ON "blocker"("contract_id", "status");

-- AddForeignKey
ALTER TABLE "blocker" ADD CONSTRAINT "blocker_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
