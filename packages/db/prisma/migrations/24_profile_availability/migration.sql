-- Availability fields on the contractor profile: the accepting-work flag, optional weekly capacity, and an
-- away/vacation end date. These drive the public availability status chip and complement the vetted badge
-- (vetting status already lives on contractor_identity).
ALTER TABLE "contractor_profile"
  ADD COLUMN "accepting_work" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "capacity_hours" INTEGER,
  ADD COLUMN "away_until" TIMESTAMP(3);
