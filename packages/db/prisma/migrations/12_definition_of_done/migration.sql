-- Definition of Done: the agreed acceptance bar on a contract (contractor drafts; mutual-lock comes later).
-- Additive nullable column; no behavior change to the existing contract/charge path.
ALTER TABLE "contract" ADD COLUMN "definition_of_done" TEXT;
