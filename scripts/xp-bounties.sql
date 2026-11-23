-- XP, bounties, Plug and sighting photos (2026-11-22).
-- Run once in the Supabase SQL Editor, AFTER scripts/sightings.sql and after
-- the app update is deployed. Safe to re-run.

-- ── 1. Sighting extras ──────────────────────────────────────────────────
-- photo_url: optional photo added after Spotted (+15 XP).
-- bounty_xp: XP bounty paid on this sighting (50 when it was the first
--            sighting at a store nobody had checked in 48 hours).
ALTER TABLE stock_reports ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE stock_reports ADD COLUMN IF NOT EXISTS bounty_xp INTEGER NOT NULL DEFAULT 0;

-- Photos must live in the reporter's own folder of the sighting-photos bucket.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_reports_photo_url_check') THEN
    ALTER TABLE stock_reports ADD CONSTRAINT stock_reports_photo_url_check
      CHECK (photo_url IS NULL OR photo_url LIKE '%/storage/v1/object/public/sighting-photos/' || user_id::text || '/%');
  END IF;
END $$;

-- latest_stock gains the photo (appended so CREATE OR REPLACE works).
CREATE OR REPLACE VIEW latest_stock AS
SELECT DISTINCT ON (store_id, drink_id)
  store_id,
  drink_id,
  quantity,
  reported_at,
  sighting,
  amount,
  photo_url
FROM stock_reports
ORDER BY store_id, drink_id, reported_at DESC;

-- ── 2. Photo storage ────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('sighting-photos', 'sighting-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read sighting photos" ON storage.objects;
CREATE POLICY "Public read sighting photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'sighting-photos');

DROP POLICY IF EXISTS "Users upload own sighting photos" ON storage.objects;
CREATE POLICY "Users upload own sighting photos"
  ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'sighting-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete own sighting photos" ON storage.objects;
CREATE POLICY "Users delete own sighting photos"
  ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'sighting-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── 3. XP leaderboard ───────────────────────────────────────────────────
-- XP: sighting +10, photo +15, bounty as paid (50), approved store +25.
-- That's exactly 5× the old points (2 per report, 5 per store), so every
-- existing total converts automatically. The column keeps the name
-- `points` so existing callers keep working; it now holds XP.
DROP FUNCTION IF EXISTS public.get_leaderboard(text);
CREATE OR REPLACE FUNCTION public.get_leaderboard(p_timeframe text DEFAULT 'All Time'::text)
RETURNS TABLE(id uuid, username text, tier text, is_verified_reporter boolean, badges jsonb, points bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_since timestamptz;
BEGIN
  IF p_timeframe = 'This Week' THEN
    v_since := date_trunc('week', now());
  ELSIF p_timeframe = 'This Month' THEN
    v_since := date_trunc('month', now());
  ELSE
    v_since := '2000-01-01'::timestamptz;
  END IF;

  RETURN QUERY
  WITH sx AS (
    SELECT sr.user_id,
           SUM(10 + CASE WHEN sr.photo_url IS NOT NULL THEN 15 ELSE 0 END + coalesce(sr.bounty_xp, 0))::bigint AS xp
    FROM stock_reports sr
    WHERE sr.reported_at >= v_since AND sr.user_id IS NOT NULL
    GROUP BY sr.user_id
  ), stx AS (
    SELECT s.submitted_by AS user_id, (COUNT(*) * 25)::bigint AS xp
    FROM stores s
    WHERE s.status = 'approved' AND s.created_at >= v_since AND s.submitted_by IS NOT NULL
    GROUP BY s.submitted_by
  )
  SELECT p.id, p.username, p.tier, p.is_verified_reporter, p.badges,
         (coalesce(sx.xp, 0) + coalesce(stx.xp, 0))::bigint AS points
  FROM profiles p
  LEFT JOIN sx ON sx.user_id = p.id
  LEFT JOIN stx ON stx.user_id = p.id
  WHERE coalesce(sx.xp, 0) + coalesce(stx.xp, 0) > 0
  ORDER BY points DESC
  LIMIT 50;
END;
$function$;

CREATE INDEX IF NOT EXISTS stock_reports_user_time_idx ON stock_reports(user_id, reported_at DESC);
