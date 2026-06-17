-- Catalog-backed profile facets: industries (the catalog broad→acute taxonomy, synced to the browse filter)
-- and tools (catalog companies the contractor knows). Both stored as denormalized JSON refs for display.
ALTER TABLE "contractor_profile"
  ADD COLUMN "industries" JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN "tools" JSONB NOT NULL DEFAULT '[]';
