-- Stand-up request + cadence: the client can request a stand-up (a flag, cleared when one is posted) and set
-- a cadence preference. Additive nullable columns on contract; no behavior change to the existing paths.
ALTER TABLE "contract" ADD COLUMN "standup_requested_at" TIMESTAMP(3);
ALTER TABLE "contract" ADD COLUMN "standup_cadence" TEXT;
