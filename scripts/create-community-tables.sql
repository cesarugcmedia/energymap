-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New Query)
-- Backs the new /community tab: text posts (optionally tagged to a store) + likes.

CREATE TABLE IF NOT EXISTS community_posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id    UUID REFERENCES stores(id) ON DELETE SET NULL,
  body        TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_post_likes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_posts_created_at ON community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_posts_store_id ON community_posts(store_id);
CREATE INDEX IF NOT EXISTS idx_community_post_likes_post_id ON community_post_likes(post_id);

ALTER TABLE community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_post_likes ENABLE ROW LEVEL SECURITY;

-- Posts are visible to any signed-in user (matches the rest of the app,
-- which is entirely behind login)
CREATE POLICY "Authenticated read posts"
  ON community_posts FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Users insert own posts"
  ON community_posts FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

-- Authors can delete their own posts; admins can moderate any post
CREATE POLICY "Users or admins delete posts"
  ON community_posts FOR DELETE
  TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Authenticated read likes"
  ON community_post_likes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Users insert own likes"
  ON community_post_likes FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own likes"
  ON community_post_likes FOR DELETE
  TO authenticated USING (auth.uid() = user_id);
