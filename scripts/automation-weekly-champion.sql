-- Weekly Champion automation
-- Run once in Supabase SQL Editor to set up the function + schedule.
-- Requires pg_cron (enabled by default on Supabase Pro).

-- 1. Function: find top reporter of the past 7 days, assign badge + notify
CREATE OR REPLACE FUNCTION assign_weekly_champion()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_champion_id  uuid;
  prev_champion_id uuid;
BEGIN
  -- Find the top reporter of the past 7 days
  SELECT user_id INTO new_champion_id
  FROM stock_reports
  WHERE reported_at >= NOW() - INTERVAL '7 days'
    AND user_id IS NOT NULL
  GROUP BY user_id
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  -- Find previous champion(s) to clear
  SELECT id INTO prev_champion_id
  FROM profiles
  WHERE badges @> ARRAY['weekly_champion']
  LIMIT 1;

  -- Clear all existing weekly_champion badges
  UPDATE profiles
  SET badges = ARRAY_REMOVE(COALESCE(badges, ARRAY[]::text[]), 'weekly_champion')
  WHERE badges @> ARRAY['weekly_champion'];

  -- Assign to new champion
  IF new_champion_id IS NOT NULL THEN
    UPDATE profiles
    SET badges = ARRAY_APPEND(COALESCE(badges, ARRAY[]::text[]), 'weekly_champion')
    WHERE id = new_champion_id;

    -- Notify the new champion (skip if same person won again)
    IF new_champion_id IS DISTINCT FROM prev_champion_id THEN
      INSERT INTO notifications (user_id, message, type, read, visible_after)
      VALUES (
        new_champion_id,
        '👑 You''re this week''s top reporter! You''ve earned the Weekly Champion badge.',
        'badge',
        false,
        NOW()
      );
    END IF;
  END IF;
END;
$$;

-- 2. Schedule: every Monday at 00:00 UTC
SELECT cron.schedule(
  'weekly-champion',
  '0 0 * * 1',
  $$ SELECT assign_weekly_champion(); $$
);
