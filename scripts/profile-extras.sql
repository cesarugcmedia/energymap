-- Profile bio, favorite drink and notification preferences — run once in the
-- Supabase SQL Editor (Dashboard → SQL Editor → New Query). Idempotent: safe
-- to re-run.
--
-- The app feature-detects these columns. Before this runs:
--   • bio / favorite drink can't be saved (the Account → Profile editor says so)
--   • notification preferences are kept on the device (localStorage)
-- After it runs, all three follow the user across devices.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS favorite_drink_id UUID REFERENCES drinks(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS muted_notification_types TEXT[] NOT NULL DEFAULT '{}';

-- Keep bios short (the profile header shows one or two lines).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_bio_length') THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_bio_length CHECK (bio IS NULL OR char_length(bio) <= 160);
  END IF;
END $$;

-- These are ordinary user-editable fields (users already update their own
-- profile row for username / last location / preferences), so no new policy
-- is needed, and they're not covered by protect_profile_privileges.
