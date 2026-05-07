-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New Query)

CREATE TABLE IF NOT EXISTS stock_confirmations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES stores(id)  ON DELETE CASCADE,
  drink_id    UUID NOT NULL REFERENCES drinks(id)  ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  confirmed   BOOLEAN NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (store_id, drink_id, user_id)
);

ALTER TABLE stock_confirmations ENABLE ROW LEVEL SECURITY;

-- Anyone can read confirmations
CREATE POLICY "Public read confirmations"
  ON stock_confirmations FOR SELECT USING (true);

-- Authenticated users can insert their own
CREATE POLICY "Users insert own confirmations"
  ON stock_confirmations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Authenticated users can update their own
CREATE POLICY "Users update own confirmations"
  ON stock_confirmations FOR UPDATE
  USING (auth.uid() = user_id);

-- Authenticated users can delete their own
CREATE POLICY "Users delete own confirmations"
  ON stock_confirmations FOR DELETE
  USING (auth.uid() = user_id);
