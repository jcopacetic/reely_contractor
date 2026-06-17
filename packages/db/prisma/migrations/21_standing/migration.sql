-- Governance standing + kill-switches: a client's billing standing (clients have no contractor_identity), plus a
-- suspend reason/timestamp on the contractor identity. Standing is the source of truth (we don't clobber contract
-- status), so reinstating cleanly restores everything. Additive.

-- AlterTable
ALTER TABLE "contractor_identity" ADD COLUMN "suspend_reason" TEXT;
ALTER TABLE "contractor_identity" ADD COLUMN "suspended_at" TIMESTAMP(3);

-- CreateEnum
CREATE TYPE "ClientStandingStatus" AS ENUM ('active', 'suspended');
CREATE TYPE "StandingSource" AS ENUM ('manual', 'auto_decline');

-- CreateTable
CREATE TABLE "client_standing" (
    "client_user_id" TEXT NOT NULL,
    "status" "ClientStandingStatus" NOT NULL DEFAULT 'active',
    "reason" TEXT,
    "note" TEXT,
    "source" "StandingSource",
    "suspended_by_user_id" TEXT,
    "suspended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_standing_pkey" PRIMARY KEY ("client_user_id")
);

-- CreateIndex
CREATE INDEX "client_standing_status_idx" ON "client_standing"("status");
