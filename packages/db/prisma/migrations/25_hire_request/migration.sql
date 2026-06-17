-- Public hire box: an optional public rate + location on the profile, and an inbound hire_request lead table
-- (anyone viewing a public /pro/[slug] can ask to hire; the contractor reads + handles their own).
ALTER TABLE "contractor_profile"
  ADD COLUMN "rate_public" INTEGER,
  ADD COLUMN "location" TEXT;

CREATE TABLE "hire_request" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "contractor_user_id" TEXT NOT NULL,
  "from_name" TEXT NOT NULL,
  "from_email" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "project_type" TEXT,
  "budget" TEXT,
  "status" TEXT NOT NULL DEFAULT 'new',
  "handled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "hire_request_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "hire_request_contractor_user_id_status_idx" ON "hire_request" ("contractor_user_id", "status");

-- RLS backstop (Data-API safety; the api writes as owner). Contractor reads/handles own; system/admin all.
ALTER TABLE "hire_request" ENABLE ROW LEVEL SECURITY;
CREATE POLICY hr_admin ON "hire_request" FOR ALL USING (current_setting('app.actor', true) IN ('system','platform_admin')) WITH CHECK (current_setting('app.actor', true) IN ('system','platform_admin'));
CREATE POLICY hr_self ON "hire_request" FOR ALL USING (contractor_user_id = current_setting('app.actor_user', true));
