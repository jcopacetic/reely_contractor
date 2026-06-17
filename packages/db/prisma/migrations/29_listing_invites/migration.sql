-- Targeted invites: a job (listing) can directly invite up to 3 contractors, who are notified + can bid.
ALTER TABLE "listing" ADD COLUMN "invited_user_ids" TEXT[] NOT NULL DEFAULT '{}';
CREATE INDEX "listing_invited_user_ids_idx" ON "listing" USING GIN ("invited_user_ids");
