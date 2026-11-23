-- Sightings follow-up (2026-11-23): badge + weekly champion automations
-- speak "sightings" and count the way the app does.
-- Run once in the Supabase SQL Editor AFTER sightings.sql and xp-bounties.sql.
-- Safe to re-run. Replaces the functions from automation-badge-notifications.sql
-- and automation-weekly-champion.sql (their triggers / cron job keep calling
-- them by name — nothing to reschedule).

-- ── 1. Badge milestones on each new sighting ────────────────────────────
-- • Sighting count milestones (Spotted and Not there both count).
-- • Flavor milestones count Spotted flavors only, and only fire when this
--   sighting is a NEW flavor for the person — the old version re-sent the
--   "5 different drinks" notification on every repeat report at 5.
CREATE OR REPLACE FUNCTION notify_badge_milestone_reports()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sighting_count bigint;
  unique_flavors bigint;
  badge_name     text;
  badge_msg      text;
BEGIN
  SELECT COUNT(*) INTO sighting_count FROM stock_reports WHERE user_id = NEW.user_id;

  CASE sighting_count
    WHEN 1   THEN badge_name := 'First Sighting'; badge_msg := '⚡ You logged your first sighting!';
    WHEN 10  THEN badge_name := 'Spotter';        badge_msg := '📊 You''ve logged 10 sightings!';
    WHEN 50  THEN badge_name := 'Veteran';        badge_msg := '🏆 You''ve logged 50 sightings!';
    WHEN 100 THEN badge_name := 'Elite';          badge_msg := '💎 You''ve logged 100 sightings!';
    WHEN 200 THEN badge_name := 'Dedicated';      badge_msg := '📈 You''ve logged 200 sightings!';
    WHEN 500 THEN badge_name := 'Legend';         badge_msg := '🚀 You''ve logged 500 sightings!';
    ELSE badge_name := NULL;
  END CASE;

  IF badge_name IS NOT NULL THEN
    INSERT INTO notifications (user_id, message, type, read, visible_after)
    VALUES (NEW.user_id, '🏅 Badge Unlocked: ' || badge_name || ' — ' || badge_msg, 'badge', false, NOW());
  END IF;

  IF coalesce(NEW.sighting, 'spotted') = 'spotted' AND NOT EXISTS (
    SELECT 1 FROM stock_reports
    WHERE user_id = NEW.user_id AND drink_id = NEW.drink_id AND id <> NEW.id
      AND coalesce(sighting, CASE WHEN quantity = 'out' THEN 'not_there' ELSE 'spotted' END) = 'spotted'
  ) THEN
    SELECT COUNT(DISTINCT drink_id) INTO unique_flavors
    FROM stock_reports
    WHERE user_id = NEW.user_id
      AND coalesce(sighting, CASE WHEN quantity = 'out' THEN 'not_there' ELSE 'spotted' END) = 'spotted';

    IF unique_flavors = 5 THEN
      INSERT INTO notifications (user_id, message, type, read, visible_after)
      VALUES (NEW.user_id, '🏅 Badge Unlocked: Flavor Hunter — 🎯 You''ve spotted 5 different flavors!', 'badge', false, NOW());
    ELSIF unique_flavors = 20 THEN
      INSERT INTO notifications (user_id, message, type, read, visible_after)
      VALUES (NEW.user_id, '🏅 Badge Unlocked: Connoisseur — 🧪 You''ve spotted 20 different flavors!', 'badge', false, NOW());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2. Weekly Champion = most XP this week ──────────────────────────────
-- Same XP the weekly leaderboard shows (get_leaderboard, xp-bounties.sql):
-- sighting +10, photo +15, bounty as paid. Badge handling is unchanged.
CREATE OR REPLACE FUNCTION assign_weekly_champion()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_champion_id  uuid;
  prev_champion_id uuid;
BEGIN
  SELECT user_id INTO new_champion_id
  FROM stock_reports
  WHERE reported_at >= NOW() - INTERVAL '7 days'
    AND user_id IS NOT NULL
  GROUP BY user_id
  ORDER BY SUM(10 + CASE WHEN photo_url IS NOT NULL THEN 15 ELSE 0 END + coalesce(bounty_xp, 0)) DESC
  LIMIT 1;

  SELECT id INTO prev_champion_id
  FROM profiles
  WHERE badges @> ARRAY['weekly_champion']
  LIMIT 1;

  UPDATE profiles
  SET badges = ARRAY_REMOVE(COALESCE(badges, ARRAY[]::text[]), 'weekly_champion')
  WHERE badges @> ARRAY['weekly_champion'];

  IF new_champion_id IS NOT NULL THEN
    UPDATE profiles
    SET badges = ARRAY_APPEND(COALESCE(badges, ARRAY[]::text[]), 'weekly_champion')
    WHERE id = new_champion_id;

    IF new_champion_id IS DISTINCT FROM prev_champion_id THEN
      INSERT INTO notifications (user_id, message, type, read, visible_after)
      VALUES (
        new_champion_id,
        '👑 You earned the most XP this week! You''re the Weekly Champion.',
        'badge',
        false,
        NOW()
      );
    END IF;
  END IF;
END;
$$;
