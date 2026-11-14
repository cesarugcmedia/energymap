-- Community v3 — run once in the Supabase SQL Editor (Dashboard → SQL Editor).
-- Requires create-community-tables.sql and create-community-v2-tables.sql to
-- have been run first. Fully idempotent: safe to re-run.
--
-- The app feature-detects these columns/tables, so the feed keeps working
-- before this is run; these features simply stay hidden until it is:
--   • "Found it" / "Looking for" post types, drink tags, stock level on posts
--   • Up to 4 photos per post
--   • Threaded replies + store tags on comments
--   • Reporting posts, blocking users, admin hiding of posts
--   • Live "new posts" updates (realtime)
--   • "View post" links on community notifications

-- ── Posts ──────────────────────────────────────────────────────────────
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS post_type TEXT NOT NULL DEFAULT 'post';
DO $$ BEGIN
  ALTER TABLE community_posts ADD CONSTRAINT community_posts_post_type_check
    CHECK (post_type IN ('post', 'found', 'looking'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS drink_id UUID REFERENCES drinks(id) ON DELETE SET NULL;
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS quantity TEXT;
DO $$ BEGIN
  ALTER TABLE community_posts ADD CONSTRAINT community_posts_quantity_check
    CHECK (quantity IS NULL OR quantity IN ('full', 'medium', 'low', 'out'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS photo_urls TEXT[];
ALTER TABLE community_posts ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_community_posts_user_id ON community_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_community_posts_drink_id ON community_posts(drink_id);

-- ── Comments: one level of threading + optional store tag ─────────────
ALTER TABLE community_post_comments ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES community_post_comments(id) ON DELETE CASCADE;
ALTER TABLE community_post_comments ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES stores(id) ON DELETE SET NULL;

-- ── Reports (users flag posts/comments; admins review in /admin) ──────
CREATE TABLE IF NOT EXISTS community_reports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
  comment_id   UUID REFERENCES community_post_comments(id) ON DELETE CASCADE,
  reporter_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 200),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_community_reports_unique
  ON community_reports (reporter_id, post_id, COALESCE(comment_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_community_reports_open ON community_reports(created_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE community_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users file reports as themselves" ON community_reports;
CREATE POLICY "Users file reports as themselves"
  ON community_reports FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = reporter_id);
-- No SELECT/UPDATE policy: only the service role (admin API) reads/resolves.

-- ── Blocks (hide a user's posts/comments for the blocker) ─────────────
CREATE TABLE IF NOT EXISTS user_blocks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);
ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users read own blocks" ON user_blocks;
CREATE POLICY "Users read own blocks" ON user_blocks FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
DROP POLICY IF EXISTS "Users block as themselves" ON user_blocks;
CREATE POLICY "Users block as themselves" ON user_blocks FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
DROP POLICY IF EXISTS "Users unblock as themselves" ON user_blocks;
CREATE POLICY "Users unblock as themselves" ON user_blocks FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

-- ── Notifications: link community notifications to their post ────────
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS post_id UUID REFERENCES community_posts(id) ON DELETE CASCADE;

-- ── Realtime: live "N new posts" pill in the feed ─────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE community_posts;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;
