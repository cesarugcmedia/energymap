-- Tracker features (2026-11-16): flavor-alert limit, push subscriptions,
-- and longer report history for restock patterns.
-- Run once in the Supabase SQL Editor. Safe to re-run.
-- The app feature-detects everything here, so it works before this is run
-- (alert limit checked in the app only, no push, patterns from 7 days).

-- ── 1. Free accounts can follow 5 flavors (Tracker / admin unlimited) ──
-- Matches FREE_ALERT_LIMIT in src/lib/plans.ts. Only checks new rows, so
-- anyone already following more keeps what they have. Upserts that update
-- an existing row (changing scope) are not affected.
CREATE OR REPLACE FUNCTION enforce_drink_alert_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_tier  text;
  p_admin boolean;
  n       int;
BEGIN
  SELECT tier, is_admin INTO p_tier, p_admin FROM profiles WHERE id = NEW.user_id;
  IF coalesce(p_admin, false) OR p_tier IN ('tracker', 'admin') THEN
    RETURN NEW;
  END IF;
  SELECT count(*) INTO n FROM drink_alerts WHERE user_id = NEW.user_id;
  IF n >= 5 THEN
    RAISE EXCEPTION 'alert_limit: free accounts can follow 5 flavors' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drink_alert_limit ON drink_alerts;
CREATE TRIGGER trg_drink_alert_limit
  BEFORE INSERT ON drink_alerts
  FOR EACH ROW EXECUTE FUNCTION enforce_drink_alert_limit();

-- ── 2. Web push subscriptions (Tracker push notifications) ──
-- One row per device/browser. Written and read only by the server
-- (service role) through /api/push/*, so RLS is on with no policies.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions(user_id);
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- ── 3. Keep 90 days of report history (was 7) ──
-- Restock patterns ("this store usually restocks Tuesdays") need weeks of
-- reports. Replaces the function from automation-stale-cleanup.sql; the
-- nightly cron job keeps calling it by name, so nothing to reschedule.
CREATE OR REPLACE FUNCTION cleanup_stale_stock()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM stock_reports
  WHERE reported_at < NOW() - INTERVAL '90 days'
    AND id NOT IN (
      SELECT DISTINCT ON (store_id, drink_id) id
      FROM stock_reports
      ORDER BY store_id, drink_id, reported_at DESC
    );
END;
$$;

CREATE INDEX IF NOT EXISTS stock_reports_store_time_idx ON stock_reports(store_id, reported_at DESC);
