-- The immutable, append-only financial ledger — one row per money event (cycle charge / failed charge / refund
-- / chargeback / adjustment), fully attributed + Stripe-reconcilable. Derived from the charge/payout lifecycle;
-- the audit-grade source of truth for dashboards, stats, exports, and disputes. Additive.

-- CreateEnum
CREATE TYPE "LedgerKind" AS ENUM ('charge', 'charge_failed', 'refund', 'chargeback', 'adjustment');

-- CreateTable
CREATE TABLE "ledger_entry" (
    "id" UUID NOT NULL,
    "kind" "LedgerKind" NOT NULL,
    "client_user_id" TEXT NOT NULL,
    "contractor_user_id" TEXT NOT NULL,
    "contract_id" UUID,
    "board_ref" TEXT,
    "billing_cycle_id" UUID,
    "charge_id" UUID,
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "fee_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "description" TEXT NOT NULL,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "task_count" INTEGER NOT NULL DEFAULT 0,
    "total_seconds" INTEGER NOT NULL DEFAULT 0,
    "stripe_payment_intent_id" TEXT,
    "stripe_transfer_id" TEXT,
    "succeeded" BOOLEAN NOT NULL DEFAULT true,
    "failure_reason" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entry_idempotency_key_key" ON "ledger_entry"("idempotency_key");
CREATE INDEX "ledger_entry_client_user_id_occurred_at_idx" ON "ledger_entry"("client_user_id", "occurred_at");
CREATE INDEX "ledger_entry_contractor_user_id_occurred_at_idx" ON "ledger_entry"("contractor_user_id", "occurred_at");
CREATE INDEX "ledger_entry_contract_id_idx" ON "ledger_entry"("contract_id");
CREATE INDEX "ledger_entry_billing_cycle_id_idx" ON "ledger_entry"("billing_cycle_id");

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
