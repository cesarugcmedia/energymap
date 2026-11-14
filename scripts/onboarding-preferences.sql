-- Welcome-flow preferences — run once in the Supabase SQL Editor.
-- Idempotent: safe to re-run.
--
-- The app feature-detects these columns: before this runs, answers from the
-- first-time welcome flow are kept on the device (localStorage) instead, so
-- nothing breaks. After it runs, they follow the user across devices.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS favorite_brands TEXT[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS store_types TEXT[];
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS home_zip TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS home_lat DOUBLE PRECISION;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS home_lng DOUBLE PRECISION;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS wants_to_report BOOLEAN;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarded_at TIMESTAMPTZ;

-- These are ordinary user-editable preferences (users already update their
-- own profile row for username / last location), so no new policy is needed.
-- They are NOT covered by protect_profile_privileges (lock-down script),
-- which only guards is_admin, tier, stripe_customer_id and badges.
