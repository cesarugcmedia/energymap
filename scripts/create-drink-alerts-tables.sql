-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New Query)
-- Backs the "follow a flavor" alert feature: users subscribe to a drink at
-- one store, within a radius, or anywhere, and get an in-app notification
-- the next time it restocks. Idempotent — safe to re-run.

-- One alert row per user+drink — scope decides where we watch for it.
-- 'store' requires store_id; 'radius' requires radius_miles + an anchor
-- point (the lat/lng of the store the alert was created from, not the
-- user's live location, so it stays meaningful after they leave); 'anywhere'
-- needs neither.
CREATE TABLE IF NOT EXISTS drink_alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  drink_id      UUID NOT NULL REFERENCES drinks(id) ON DELETE CASCADE,
  scope         TEXT NOT NULL CHECK (scope IN ('store', 'radius', 'anywhere')),
  store_id      UUID REFERENCES stores(id) ON DELETE CASCADE,
  radius_miles  NUMERIC,
  anchor_lat    NUMERIC,
  anchor_lng    NUMERIC,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, drink_id)
);

CREATE INDEX IF NOT EXISTS idx_drink_alerts_drink_id ON drink_alerts(drink_id);
CREATE INDEX IF NOT EXISTS idx_drink_alerts_user_id ON drink_alerts(user_id);

ALTER TABLE drink_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own alerts" ON drink_alerts;
CREATE POLICY "Users manage their own alerts"
  ON drink_alerts FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Fires an in-app notification (reuses the existing notifications table +
-- real-time bell — no push infrastructure) when a drink genuinely restocks:
-- the new report isn't 'out', and the prior report for that store+drink
-- (if any) was 'out'. A same-state re-report (already in stock, reported
-- again) deliberately does NOT notify — that's not a restock.
CREATE OR REPLACE FUNCTION notify_drink_alert_subscribers()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  prev_quantity text;
  s_name        text;
  s_lat         numeric;
  s_lng         numeric;
  d_label       text;
  alert_row     RECORD;
BEGIN
  IF NEW.quantity = 'out' THEN
    RETURN NEW;
  END IF;

  SELECT quantity INTO prev_quantity
  FROM stock_reports
  WHERE store_id = NEW.store_id AND drink_id = NEW.drink_id AND id != NEW.id
  ORDER BY reported_at DESC
  LIMIT 1;

  IF prev_quantity IS NOT NULL AND prev_quantity != 'out' THEN
    RETURN NEW; -- was already in stock, not a restock
  END IF;

  SELECT name, lat, lng INTO s_name, s_lat, s_lng FROM stores WHERE id = NEW.store_id;
  SELECT COALESCE(flavor, name) INTO d_label FROM drinks WHERE id = NEW.drink_id;

  FOR alert_row IN
    SELECT * FROM drink_alerts
    WHERE drink_id = NEW.drink_id
      AND user_id != NEW.user_id
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
    INSERT INTO notifications (user_id, message, type, read, visible_after)
    VALUES (alert_row.user_id, '🔔 ' || d_label || ' is back in stock at ' || s_name || '!', 'drink_alert', false, NOW());
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drink_alert_notify ON stock_reports;
CREATE TRIGGER trg_drink_alert_notify
  AFTER INSERT ON stock_reports
  FOR EACH ROW
  WHEN (NEW.user_id IS NOT NULL)
  EXECUTE FUNCTION notify_drink_alert_subscribers();
