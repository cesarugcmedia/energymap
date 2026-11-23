-- Sightings (2026-11-22): community reports become "Spotted" / "Not there"
-- sightings with an optional amount ("Just a few" / "Plenty"), replacing
-- full / medium / low / out.
--
-- Run once in the Supabase SQL Editor, AFTER the app update is deployed.
-- Safe to re-run. Nothing is deleted: every old report keeps its original
-- full/medium/low/out value in the `quantity` column.

-- ── 1. New columns ──────────────────────────────────────────────────────
ALTER TABLE stock_reports ADD COLUMN IF NOT EXISTS sighting TEXT;
ALTER TABLE stock_reports ADD COLUMN IF NOT EXISTS amount TEXT;
-- `quantity` is now only the pre-sightings original; new reports leave it empty.
ALTER TABLE stock_reports ALTER COLUMN quantity DROP NOT NULL;
COMMENT ON COLUMN stock_reports.quantity IS 'Original full/medium/low/out from before sightings (2026-11). Kept for reference; NULL on new reports.';
COMMENT ON COLUMN stock_reports.sighting IS 'spotted | not_there';
COMMENT ON COLUMN stock_reports.amount IS 'few | plenty | NULL (optional, given after Spotted)';

-- ── 2. Migrate old reports (original kept in `quantity`) ────────────────
-- full → spotted + plenty; medium / low → spotted + few; out → not_there.
UPDATE stock_reports
SET sighting = CASE WHEN quantity = 'out' THEN 'not_there' ELSE 'spotted' END,
    amount   = CASE quantity WHEN 'full' THEN 'plenty' WHEN 'medium' THEN 'few' WHEN 'low' THEN 'few' ELSE NULL END
WHERE sighting IS NULL;

-- ── 3. Fill sighting for any report that arrives without it ─────────────
-- (e.g. an offline report saved by an older version of the app).
CREATE OR REPLACE FUNCTION public.stock_reports_fill_sighting()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.sighting IS NULL THEN
    NEW.sighting := CASE WHEN NEW.quantity = 'out' THEN 'not_there' ELSE 'spotted' END;
    IF NEW.amount IS NULL THEN
      NEW.amount := CASE NEW.quantity WHEN 'full' THEN 'plenty' WHEN 'medium' THEN 'few' WHEN 'low' THEN 'few' ELSE NULL END;
    END IF;
  END IF;
  IF NEW.sighting = 'not_there' THEN
    NEW.amount := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_reports_fill_sighting ON stock_reports;
CREATE TRIGGER trg_stock_reports_fill_sighting
  BEFORE INSERT OR UPDATE ON stock_reports
  FOR EACH ROW EXECUTE FUNCTION public.stock_reports_fill_sighting();

ALTER TABLE stock_reports ALTER COLUMN sighting SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_reports_sighting_check') THEN
    ALTER TABLE stock_reports ADD CONSTRAINT stock_reports_sighting_check CHECK (sighting IN ('spotted', 'not_there'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_reports_amount_check') THEN
    ALTER TABLE stock_reports ADD CONSTRAINT stock_reports_amount_check CHECK (amount IS NULL OR amount IN ('few', 'plenty'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS stock_reports_store_drink_time_idx ON stock_reports(store_id, drink_id, reported_at DESC);

-- ── 4. latest_stock: newest report per store + flavor, now with sighting ─
-- New columns are appended so CREATE OR REPLACE keeps working.
CREATE OR REPLACE VIEW latest_stock AS
SELECT DISTINCT ON (store_id, drink_id)
  store_id,
  drink_id,
  quantity,
  reported_at,
  sighting,
  amount
FROM stock_reports
ORDER BY store_id, drink_id, reported_at DESC;

-- ── 5. Restock alerts ───────────────────────────────────────────────────
-- Fires on a new "Spotted" when the previous report for that flavor at that
-- store was "Not there", when it hasn't been spotted there in 3 days, or
-- when it was never reported there.
CREATE OR REPLACE FUNCTION public.notify_drink_alert_subscribers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prev_sighting text;
  prev_at       timestamptz;
  s_name        text;
  s_lat         numeric;
  s_lng         numeric;
  d_label       text;
  alert_row     RECORD;
BEGIN
  IF coalesce(NEW.sighting, 'spotted') <> 'spotted' THEN
    RETURN NEW;
  END IF;

  SELECT sighting, reported_at INTO prev_sighting, prev_at
  FROM stock_reports
  WHERE store_id = NEW.store_id AND drink_id = NEW.drink_id AND id <> NEW.id
  ORDER BY reported_at DESC
  LIMIT 1;

  IF prev_sighting = 'spotted' AND prev_at > coalesce(NEW.reported_at, now()) - interval '3 days' THEN
    RETURN NEW; -- seen recently, not a restock
  END IF;

  SELECT name, lat, lng INTO s_name, s_lat, s_lng FROM stores WHERE id = NEW.store_id;
  SELECT COALESCE(flavor, name) INTO d_label FROM drinks WHERE id = NEW.drink_id;

  FOR alert_row IN
    SELECT * FROM drink_alerts
    WHERE drink_id = NEW.drink_id
      AND user_id <> NEW.user_id
      AND (
        (scope = 'anywhere')
        OR (scope = 'store' AND store_id = NEW.store_id)
        OR (
          scope = 'radius' AND anchor_lat IS NOT NULL AND anchor_lng IS NOT NULL AND radius_miles IS NOT NULL
          AND (3958.8 * 2 * asin(sqrt(
                sin(radians((s_lat - anchor_lat) / 2)) ^ 2 +
                cos(radians(anchor_lat)) * cos(radians(s_lat)) * sin(radians((s_lng - anchor_lng) / 2)) ^ 2
              ))) <= radius_miles
        )
      )
  LOOP
    INSERT INTO notifications (user_id, message, type, read, visible_after, store_id)
    VALUES (alert_row.user_id, '🔔 ' || d_label || ' was just spotted at ' || s_name || '!', 'drink_alert', false, NOW(), NEW.store_id);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drink_alert_notify ON stock_reports;
CREATE TRIGGER trg_drink_alert_notify
  AFTER INSERT ON stock_reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_drink_alert_subscribers();

-- ── 6. Flavor collection counts "Spotted" ───────────────────────────────
-- (Only matters if profile-v2.sql has been run; it created the trigger.)
CREATE OR REPLACE FUNCTION public.record_flavor_find()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.drink_id IS NOT NULL AND coalesce(NEW.sighting, 'spotted') = 'spotted' THEN
    INSERT INTO flavor_finds (user_id, drink_id, first_found_at)
    VALUES (NEW.user_id, NEW.drink_id, coalesce(NEW.reported_at, now()))
    ON CONFLICT (user_id, drink_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 7. "Spotted nearby" notifications ───────────────────────────────────
-- Replaces the three old notify_stock_update versions:
--  • a trigger version that notified EVERY user on every report (reporter
--    included) — removed below wherever it's attached;
--  • the version the app called (150 mi, but no notification type);
--  • an old integer version referring to a "hunter" plan that doesn't exist.
-- The app calls this once per reporter per store every 10 minutes, and only
-- for Spotted, so a quick check of ten flavors doesn't send ten alerts.
CREATE OR REPLACE FUNCTION public.notify_sighting(p_store_id uuid, p_drink_name text, p_reporter_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lat double precision;
  v_lng double precision;
  v_store text;
  v_who text;
BEGIN
  SELECT lat, lng, name INTO v_lat, v_lng, v_store FROM stores WHERE id = p_store_id;
  SELECT username INTO v_who FROM profiles WHERE id = p_reporter_id;
  IF v_lat IS NULL THEN RETURN; END IF;

  INSERT INTO notifications (user_id, store_id, type, message, read, visible_after)
  SELECT p.id, p_store_id, 'stock_update',
         '@' || coalesce(v_who, 'someone') || ' spotted ' || p_drink_name || ' at ' || v_store,
         false, now()
  FROM profiles p
  WHERE p.id <> p_reporter_id
    AND p.last_lat IS NOT NULL AND p.last_lng IS NOT NULL
    AND 3958.8 * 2 * asin(sqrt(
          power(sin(radians(p.last_lat - v_lat) / 2), 2) +
          cos(radians(v_lat)) * cos(radians(p.last_lat)) * power(sin(radians(p.last_lng - v_lng) / 2), 2)
        )) <= 150;
END;
$$;

-- Remove every trigger on stock_reports that runs the old notify_stock_update().
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT tg.tgname
    FROM pg_trigger tg
    JOIN pg_proc p ON p.oid = tg.tgfoid
    WHERE tg.tgrelid = 'public.stock_reports'::regclass
      AND NOT tg.tgisinternal
      AND p.proname = 'notify_stock_update'
  LOOP
    EXECUTE format('DROP TRIGGER %I ON public.stock_reports', t.tgname);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.notify_stock_update();
DROP FUNCTION IF EXISTS public.notify_stock_update(uuid, text, integer, text);
DROP FUNCTION IF EXISTS public.notify_stock_update(uuid, text, text, text);
