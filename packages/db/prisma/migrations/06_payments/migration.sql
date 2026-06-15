-- CreateEnum
CREATE TYPE "StripeKycStatus" AS ENUM ('pending', 'verified', 'restricted');
CREATE TYPE "BillingCycleStatus" AS ENUM ('open', 'dispute_window', 'charged', 'disputed', 'voided');
CREATE TYPE "ChargeStatus" AS ENUM ('pending', 'succeeded', 'failed', 'refunded');
CREATE TYPE "PayoutStatus" AS ENUM ('pending', 'paid', 'failed');
CREATE TYPE "CycleDisputeStatus" AS ENUM ('open', 'resolved_charge', 'resolved_void');

-- CreateTable
CREATE TABLE "stripe_account" (
    "id" UUID NOT NULL,
    "contractor_user_id" TEXT NOT NULL,
    "stripe_account_id" TEXT NOT NULL,
    "charges_enabled" BOOLEAN NOT NULL DEFAULT false,
    "payouts_enabled" BOOLEAN NOT NULL DEFAULT false,
    "kyc_status" "StripeKycStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stripe_account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "billing_cycle" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "status" "BillingCycleStatus" NOT NULL DEFAULT 'open',
    "total_seconds" INTEGER NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "take_rate_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dispute_window_ends_at" TIMESTAMP(3) NOT NULL,
    "charged_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "billing_cycle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "charge" (
    "id" UUID NOT NULL,
    "billing_cycle_id" UUID NOT NULL,
    "stripe_payment_intent_id" TEXT,
    "client_user_id" TEXT NOT NULL,
    "contractor_user_id" TEXT NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "take_rate_amount" DECIMAL(12,2) NOT NULL,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'pending',
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "succeeded_at" TIMESTAMP(3),
    CONSTRAINT "charge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payout" (
    "id" UUID NOT NULL,
    "charge_id" UUID NOT NULL,
    "stripe_transfer_id" TEXT,
    "contractor_user_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cycle_dispute" (
    "id" UUID NOT NULL,
    "billing_cycle_id" UUID NOT NULL,
    "raised_by_user_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "CycleDisputeStatus" NOT NULL DEFAULT 'open',
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    CONSTRAINT "cycle_dispute_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stripe_account_contractor_user_id_key" ON "stripe_account"("contractor_user_id");
CREATE UNIQUE INDEX "stripe_account_stripe_account_id_key" ON "stripe_account"("stripe_account_id");
CREATE UNIQUE INDEX "billing_cycle_contract_id_period_start_key" ON "billing_cycle"("contract_id", "period_start");
CREATE INDEX "billing_cycle_status_idx" ON "billing_cycle"("status");
CREATE UNIQUE INDEX "charge_billing_cycle_id_key" ON "charge"("billing_cycle_id");
CREATE UNIQUE INDEX "charge_idempotency_key_key" ON "charge"("idempotency_key");
CREATE UNIQUE INDEX "payout_charge_id_key" ON "payout"("charge_id");
CREATE INDEX "payout_contractor_user_id_idx" ON "payout"("contractor_user_id");
CREATE INDEX "cycle_dispute_billing_cycle_id_idx" ON "cycle_dispute"("billing_cycle_id");

-- AddForeignKey
ALTER TABLE "billing_cycle" ADD CONSTRAINT "billing_cycle_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "charge" ADD CONSTRAINT "charge_billing_cycle_id_fkey" FOREIGN KEY ("billing_cycle_id") REFERENCES "billing_cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payout" ADD CONSTRAINT "payout_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "charge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cycle_dispute" ADD CONSTRAINT "cycle_dispute_billing_cycle_id_fkey" FOREIGN KEY ("billing_cycle_id") REFERENCES "billing_cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "time_entry" ADD CONSTRAINT "time_entry_billing_cycle_id_fkey" FOREIGN KEY ("billing_cycle_id") REFERENCES "billing_cycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
