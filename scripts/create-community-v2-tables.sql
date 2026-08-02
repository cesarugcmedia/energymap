-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New Query)
-- Adds the deferred community pieces: comments, follows, and photo uploads.
-- Safe to re-run — policies are dropped/recreated, tables/columns use IF NOT EXISTS.
-- Requires create-community-tables.sql to have been run first.

-- ── Comments ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS community_post_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 300),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_post_comments_post_id ON community_post_comments(post_id);

ALTER TABLE community_post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read comments" ON community_post_comments;
CREATE POLICY "Authenticated read comments"
  ON community_post_comments FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Users insert own comments" ON community_post_comments;
CREATE POLICY "Users insert own comments"
  ON community_post_comments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users or admins delete comments" ON community_post_comments;
CREATE POLICY "Users or admins delete comments"
  ON community_post_comments FOR DELETE
  TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- ── Follows ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS follows (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  followed_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (follower_id, followed_id),
  CHECK (follower_id != followed_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_followed_id ON follows(followed_id);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read follows" ON follows;
CREATE POLICY "Authenticated read follows"
  ON follows FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Users follow as themselves" ON follows;
CREATE POLICY "Users follow as themselves"
  ON follows FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Users unfollow as themselves" ON follows;
CREATE POLICY "Users unfollow as themselves"
  ON follows FOR DELETE
  TO authenticated USING (auth.uid() = follower_id);

-- ── Photo uploads ─────────────────────────────────────────────────────────

ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Public bucket: community post photos aren't sensitive (public store finds),
-- and a public bucket avoids needing signed URLs just to render an <img>.
INSERT INTO storage.buckets (id, name, public)
VALUES ('community-photos', 'community-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read community photos" ON storage.objects;
CREATE POLICY "Public read community photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'community-photos');

-- Uploads must live under a folder named after the uploader's own user id
-- (e.g. "<user_id>/photo.jpg") — enforced here so one user can't write into
-- another user's folder.
DROP POLICY IF EXISTS "Users upload own community photos" ON storage.objects;
CREATE POLICY "Users upload own community photos"
  ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'community-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete own community photos" ON storage.objects;
CREATE POLICY "Users delete own community photos"
  ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'community-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
