-- Enrich reviews: weekly pulse + kudos chips + final-review dimension stars. Additive + backward-compatible
-- (existing rows keep their rating + body). rating/body become nullable (a pulse-only weekly has neither).
CREATE TYPE "ReviewPulse" AS ENUM ('up', 'neutral', 'down');

ALTER TABLE "contractor_review"
  ALTER COLUMN "rating" DROP NOT NULL,
  ALTER COLUMN "body" DROP NOT NULL,
  ADD COLUMN "pulse" "ReviewPulse",
  ADD COLUMN "dimensions" JSONB,
  ADD COLUMN "kudos" TEXT[] NOT NULL DEFAULT '{}';
