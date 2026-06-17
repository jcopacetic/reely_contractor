-- Notification email digest: each notification is emailed at most once (emailed_at) + a per-recipient
-- email-digest opt-out (notification_pref, flipped by the one-click unsubscribe link). Additive.

-- AlterTable
ALTER TABLE "notification" ADD COLUMN "emailed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "notification_pref" (
    "user_id" TEXT NOT NULL,
    "email_unsubscribed" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_pref_pkey" PRIMARY KEY ("user_id")
);
