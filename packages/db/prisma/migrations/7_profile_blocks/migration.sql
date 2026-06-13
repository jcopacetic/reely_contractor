-- Ordered landing-page content blocks (text/links/image/list) on the contractor profile. Additive; the legacy
-- flat `links` column stays for back-compat (synthesized into a links block when `blocks` is empty).
ALTER TABLE "contractor_profile" ADD COLUMN "blocks" JSONB NOT NULL DEFAULT '[]';
