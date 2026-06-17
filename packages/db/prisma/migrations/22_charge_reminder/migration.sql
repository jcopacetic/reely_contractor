-- Weekly lifecycle: a guard so the T-24h "charging soon" reminder fires at most once per cycle. Additive.

-- AlterTable
ALTER TABLE "billing_cycle" ADD COLUMN "charge_reminder_sent_at" TIMESTAMP(3);
