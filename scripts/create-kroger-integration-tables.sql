-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New Query)
-- Backs the Kroger availability integration: matches stores to a real Kroger
-- location, matches drinks to a Kroger UPC, and stores the synced availability.

-- Which real Kroger location (if any) a store row corresponds to
ALTER TABLE stores ADD COLUMN IF NOT EXISTS kroger_location_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_kroger_location_id
  ON stores(kroger_location_id) WHERE kroger_location_id IS NOT NULL;

-- Which Kroger product (UPC) a drink corresponds to
ALTER TABLE drinks ADD COLUMN IF NOT EXISTS kroger_upc TEXT;

-- Kroger-sourced availability per store+drink, refreshed by the sync job.
-- Kept separate from stock_reports/latest_stock (crowdsourced data) rather
-- than inserted as synthetic reports — this is "verified by Kroger" data
-- shown alongside user reports, not a substitute for them.
CREATE TABLE IF NOT EXISTS kroger_stock (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  drink_id    UUID NOT NULL REFERENCES drinks(id) ON DELETE CASCADE,
  in_stock    BOOLEAN NOT NULL,
  price       NUMERIC(10,2),
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, drink_id)
);

-- Coarse stock-level signal from Kroger's inventory.stockLevel field (a
-- string like "HIGH"/"MEDIUM"/"LOW", observed live but not exhaustively
-- documented by Kroger) — nullable, since older synced rows and any product
-- Kroger doesn't report a level for won't have one.
ALTER TABLE kroger_stock ADD COLUMN IF NOT EXISTS stock_level TEXT;

CREATE INDEX IF NOT EXISTS idx_kroger_stock_store_id ON kroger_stock(store_id);

ALTER TABLE kroger_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read kroger stock" ON kroger_stock;
CREATE POLICY "Authenticated read kroger stock"
  ON kroger_stock FOR SELECT
  TO authenticated USING (true);

-- No client insert/update/delete policy — only the service role (used by the
-- sync job) writes to this table.
