-- Sprint review / acceptance: agreed → contractor submits → review → client accepts → completed.
-- Additive (new enum value + nullable columns). The billing tie + auto-accept cron are separate, later tasks.

-- AlterEnum
ALTER TYPE "SprintStatus" ADD VALUE 'review' BEFORE 'completed';

-- AlterTable
ALTER TABLE "sprint" ADD COLUMN "submitted_at" TIMESTAMP(3);
ALTER TABLE "sprint" ADD COLUMN "review_due_at" TIMESTAMP(3);
ALTER TABLE "sprint" ADD COLUMN "accepted_at" TIMESTAMP(3);
ALTER TABLE "sprint" ADD COLUMN "auto_accepted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sprint" ADD COLUMN "submission_note" TEXT;
ALTER TABLE "sprint" ADD COLUMN "change_request_note" TEXT;
