-- Stale stock report cleanup
-- Run once in Supabase SQL Editor to set up the function + schedule.
-- Requires pg_cron (enabled by default on Supabase Pro).

-- 1. Function: delete old non-latest reports
--    Keeps the most recent report per store+drink (even if old — shows as Unverified in UI).
--    Deletes everything older than 7 days that is NOT the latest for its store+drink pair.
CREATE OR REPLACE FUNCTION cleanup_stale_stock()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM stock_reports
  WHERE reported_at < NOW() - INTERVAL '7 days'
    AND id NOT IN (
      SELECT DISTINCT ON (store_id, drink_id) id
      FROM stock_reports
      ORDER BY store_id, drink_id, reported_at DESC
    );
END;
$$;

-- 2. Schedule: every night at 3:00 AM UTC
SELECT cron.schedule(
  'cleanup-stale-stock',
  '0 3 * * *',
  $$ SELECT cleanup_stale_stock(); $$
);
