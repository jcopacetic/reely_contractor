-- Settings hub: per-category notification channel prefs, and a link-only (non-searchable) public-profile option.
ALTER TABLE "notification_pref" ADD COLUMN "category_prefs" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "contractor_profile" ADD COLUMN "searchable" BOOLEAN NOT NULL DEFAULT true;
