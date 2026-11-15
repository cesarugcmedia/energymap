-- Profiles v2: profile photos, privacy settings and the flavor collection.
-- Run once in the Supabase SQL Editor (Dashboard → SQL Editor → New Query).
-- Idempotent: safe to re-run.
--
-- The app feature-detects all of this. Before it runs:
--   • profile photos can't be uploaded (Account → Profile says so)
--   • the Privacy switches can't be saved (Account → Privacy says so)
--   • the flavor collection is built from recent reports only (non-latest
--     reports are pruned after 7 days), so it undercounts
-- After it runs, everything is permanent and follows the user across devices.

-- ── 1. Columns ───────────────────────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hide_from_search BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS anonymous_reports BOOLEAN NOT NULL DEFAULT false;

-- A profile photo may only be that user's own file in this project's avatars
-- bucket (what the app uploads), never an arbitrary external URL — otherwise
-- someone could point their photo at a tracking pixel or unmoderated image.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_avatar_url_own;
ALTER TABLE profiles ADD CONSTRAINT profiles_avatar_url_own CHECK (
  avatar_url IS NULL OR avatar_url ~ (
    '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/avatars/' || id::text || '/avatar\.jpg(\?v=[0-9]+)?$'
  )
);

-- ── 2. Storage bucket for profile photos ─────────────────────────────────
-- 2 MB cap and images only (the app uploads ~30 KB JPEGs).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 2097152, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
CREATE POLICY "avatars public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars own upload" ON storage.objects;
CREATE POLICY "avatars own upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars own update" ON storage.objects;
CREATE POLICY "avatars own update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars own delete" ON storage.objects;
CREATE POLICY "avatars own delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ── 3. Flavor collection ─────────────────────────────────────────────────
-- One row per flavor a user has ever reported in stock. Kept forever (the
-- nightly cleanup only prunes stock_reports), so the profile's
-- "47 of 212 flavors" collection never shrinks.
CREATE TABLE IF NOT EXISTS flavor_finds (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  drink_id UUID NOT NULL REFERENCES drinks(id) ON DELETE CASCADE,
  first_found_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, drink_id)
);
-- Read only through the service role (/api/community/profile).
ALTER TABLE flavor_finds ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.record_flavor_find()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.drink_id IS NOT NULL AND NEW.quantity <> 'out' THEN
    INSERT INTO flavor_finds (user_id, drink_id, first_found_at)
    VALUES (NEW.user_id, NEW.drink_id, coalesce(NEW.reported_at, now()))
    ON CONFLICT (user_id, drink_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_flavor_find ON stock_reports;
CREATE TRIGGER record_flavor_find
  AFTER INSERT ON stock_reports
  FOR EACH ROW EXECUTE FUNCTION public.record_flavor_find();

-- Backfill from the reports that still exist.
INSERT INTO flavor_finds (user_id, drink_id, first_found_at)
SELECT user_id, drink_id, min(reported_at)
FROM stock_reports
WHERE user_id IS NOT NULL AND drink_id IS NOT NULL AND quantity <> 'out'
GROUP BY user_id, drink_id
ON CONFLICT (user_id, drink_id) DO NOTHING;
