-- Badge notification triggers
-- Run once in Supabase SQL Editor.
-- Fires a notification when a user crosses a badge milestone.

-- ── 1. Trigger on stock_reports (report count + unique drink milestones) ──

CREATE OR REPLACE FUNCTION notify_badge_milestone_reports()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  report_count  bigint;
  unique_drinks bigint;
  badge_name    text;
  badge_msg     text;
BEGIN
  -- Total reports for this user
  SELECT COUNT(*) INTO report_count
  FROM stock_reports
  WHERE user_id = NEW.user_id;

  -- Report count milestones (only fire on exact count so we don't double-notify)
  CASE report_count
    WHEN 1   THEN badge_name := 'First Report';  badge_msg := '⚡ You submitted your first stock report!';
    WHEN 10  THEN badge_name := 'Reporter';      badge_msg := '📊 You''ve submitted 10 stock reports!';
    WHEN 50  THEN badge_name := 'Veteran';       badge_msg := '🏆 You''ve submitted 50 stock reports!';
    WHEN 100 THEN badge_name := 'Elite';         badge_msg := '💎 You''ve submitted 100 stock reports!';
    WHEN 200 THEN badge_name := 'Dedicated';     badge_msg := '📈 You''ve submitted 200 stock reports!';
    WHEN 500 THEN badge_name := 'Legend';        badge_msg := '🚀 You''ve submitted 500 stock reports!';
    ELSE badge_name := NULL;
  END CASE;

  IF badge_name IS NOT NULL THEN
    INSERT INTO notifications (user_id, message, type, read, visible_after)
    VALUES (NEW.user_id, '🏅 Badge Unlocked: ' || badge_name || ' — ' || badge_msg, 'badge', false, NOW());
  END IF;

  -- Unique drink milestones
  SELECT COUNT(DISTINCT drink_id) INTO unique_drinks
  FROM stock_reports
  WHERE user_id = NEW.user_id;

  IF unique_drinks = 5 THEN
    INSERT INTO notifications (user_id, message, type, read, visible_after)
    VALUES (NEW.user_id, '🏅 Badge Unlocked: Flavor Hunter — 🎯 You''ve reported 5 different drinks!', 'badge', false, NOW());
  ELSIF unique_drinks = 20 THEN
    INSERT INTO notifications (user_id, message, type, read, visible_after)
    VALUES (NEW.user_id, '🏅 Badge Unlocked: Connoisseur — 🧪 You''ve reported 20 different drinks!', 'badge', false, NOW());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_badge_milestone_reports ON stock_reports;
CREATE TRIGGER trg_badge_milestone_reports
  AFTER INSERT ON stock_reports
  FOR EACH ROW
  WHEN (NEW.user_id IS NOT NULL)
  EXECUTE FUNCTION notify_badge_milestone_reports();


-- ── 2. Trigger on stores (store count milestones when a store is approved) ──

CREATE OR REPLACE FUNCTION notify_badge_milestone_stores()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  store_count bigint;
  badge_name  text;
  badge_msg   text;
BEGIN
  -- Only fire when status changes TO approved
  IF NEW.status = 'approved' AND OLD.status != 'approved' AND NEW.submitted_by IS NOT NULL THEN
    SELECT COUNT(*) INTO store_count
    FROM stores
    WHERE submitted_by = NEW.submitted_by
      AND status = 'approved';

    CASE store_count
      WHEN 1  THEN badge_name := 'Scout';   badge_msg := '📍 Your first store was approved!';
      WHEN 5  THEN badge_name := 'Pathfinder'; badge_msg := '🗺️ You''ve had 5 stores approved!';
      WHEN 10 THEN badge_name := 'Builder'; badge_msg := '🏗️ You''ve had 10 stores approved!';
      ELSE badge_name := NULL;
    END CASE;

    IF badge_name IS NOT NULL THEN
      INSERT INTO notifications (user_id, message, type, read, visible_after)
      VALUES (NEW.submitted_by, '🏅 Badge Unlocked: ' || badge_name || ' — ' || badge_msg, 'badge', false, NOW());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_badge_milestone_stores ON stores;
CREATE TRIGGER trg_badge_milestone_stores
  AFTER UPDATE ON stores
  FOR EACH ROW
  EXECUTE FUNCTION notify_badge_milestone_stores();
