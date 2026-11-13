-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New Query)
-- Tears down the retired Kroger integration (reverses the old
-- create-kroger-integration-tables.sql).
--
-- ORDER MATTERS: run this only AFTER the code that stops referencing Kroger
-- has been deployed. Dropping columns the live code still selects breaks
-- those queries in production (the same failure as the old stores.state
-- column mix-up, in reverse).
--
-- Stores that were created by the Kroger location import are deliberately
-- KEPT. They are real, approved store rows that users may have reported
-- stock at since. Only the Kroger-specific link column is removed.

DROP TABLE IF EXISTS kroger_stock;

DROP INDEX IF EXISTS idx_stores_kroger_location_id;
ALTER TABLE stores DROP COLUMN IF EXISTS kroger_location_id;

ALTER TABLE drinks DROP COLUMN IF EXISTS kroger_upc;
