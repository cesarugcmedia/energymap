-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New Query)
-- Adds a state column to stores, used to limit the public map/list/stats to
-- NC & FL for now. Run scripts/tag-store-states.mjs after this to populate it.

ALTER TABLE stores ADD COLUMN IF NOT EXISTS state TEXT;
CREATE INDEX IF NOT EXISTS idx_stores_state ON stores(state);
