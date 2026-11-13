-- Run in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
--
-- Makes sure only you can be an admin, and that nobody can grant themselves
-- admin, Tracker, verified-reporter status or badges from the browser.
--
-- Why: the app writes to `profiles` directly from the client (signup inserts
-- the row, /account updates `username`, the map updates `last_lat/last_lng`).
-- The RLS policies on `profiles` were set up in the dashboard, not in this
-- repo, so nothing here guarantees a user can't also send
-- `update({ is_admin: true })` from the browser console. This trigger blocks
-- that at the database level no matter what the RLS policies allow.

-- ─────────────────────────────────────────────────────────────────────────
-- STEP 1 — LOOK FIRST. Run this SELECT alone and check the results.
-- Every row is an account that can open /admin right now.
-- ─────────────────────────────────────────────────────────────────────────
SELECT p.id, p.username, u.email, p.created_at
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.is_admin = true;

-- If anyone other than you is listed, remove their admin access
-- (replace the username and uncomment):
-- UPDATE profiles SET is_admin = false WHERE username = 'someone_else';

-- ─────────────────────────────────────────────────────────────────────────
-- STEP 2 — LOCK IT DOWN. Run everything below.
-- ─────────────────────────────────────────────────────────────────────────
-- Requests made with a user's login (role 'authenticated' / 'anon') may not
-- change privileged columns. Server code using the service-role key (Stripe
-- webhook, /api/upgrade/tracker) and the SQL Editor / pg_cron jobs (weekly
-- champion badge) are unaffected, since they don't run as those roles.
-- An admin may still toggle another user's `is_verified_reporter`, which the
-- admin Users tab does from the browser.

CREATE OR REPLACE FUNCTION public.protect_profile_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'role',
    ''
  );
  caller_is_admin boolean;
BEGIN
  IF caller_role NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;  -- service role, SQL Editor, cron: trusted
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.is_admin, false)
       OR coalesce(NEW.is_verified_reporter, false)
       OR coalesce(NEW.tier, 'free') <> 'free'
       OR NEW.stripe_customer_id IS NOT NULL
       OR coalesce(array_length(NEW.badges, 1), 0) > 0 THEN
      RAISE EXCEPTION 'Not allowed to set privileged profile fields';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
     OR NEW.tier IS DISTINCT FROM OLD.tier
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.badges IS DISTINCT FROM OLD.badges THEN
    RAISE EXCEPTION 'Not allowed to change privileged profile fields';
  END IF;

  IF NEW.is_verified_reporter IS DISTINCT FROM OLD.is_verified_reporter THEN
    SELECT is_admin INTO caller_is_admin FROM profiles WHERE id = auth.uid();
    IF NOT coalesce(caller_is_admin, false) THEN
      RAISE EXCEPTION 'Only admins can change verified reporter status';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_privileges ON profiles;
CREATE TRIGGER protect_profile_privileges
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileges();
