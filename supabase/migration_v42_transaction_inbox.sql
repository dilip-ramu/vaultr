-- ── Migration v42: Transaction Inbox (email→draft→approve) ───────────────────
-- Bank transaction alert emails become drafts you triage, then approve into
-- real transactions. Nothing here touches existing transactions or balances.

-- 1. Per-account matching digits — the last 4 (account or card) that appear in
--    that account's alert emails. Falls back to account_number's last 4 if empty.
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS matching_digits TEXT;

-- A monitored sender is either a document source (existing supplier-invoice
-- inbox) or a bank-alert source (the new Transaction Inbox). Default keeps the
-- existing behaviour unchanged.
ALTER TABLE monitored_senders
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'document';

-- 2. Drafts queue
CREATE TABLE IF NOT EXISTS transaction_drafts (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source            TEXT        NOT NULL DEFAULT 'email',  -- 'email' | 'manual'
  -- email provenance (dedup + trace)
  email_message_id  TEXT,
  sender_email      TEXT,
  received_at       TIMESTAMPTZ,
  raw_text          TEXT,                                   -- parsed body snippet
  -- parsed fields
  merchant          TEXT,                                   -- raw extracted merchant
  name              TEXT,                                   -- editable; defaults to merchant
  amount            DECIMAL(14,2),
  direction         TEXT        NOT NULL DEFAULT 'debit',   -- 'debit' | 'credit'
  txn_date          DATE,
  partial_account   TEXT,                                   -- last 4 digits from the email
  confidence        DECIMAL(4,3),                           -- 0..1, parser confidence
  -- user choices
  matched_account_id  UUID REFERENCES accounts(id)   ON DELETE SET NULL,
  category_id         UUID REFERENCES categories(id) ON DELETE SET NULL,
  payee_id            UUID REFERENCES payees(id)     ON DELETE SET NULL,
  -- lifecycle
  status            TEXT        NOT NULL DEFAULT 'pending',  -- pending | needs_account | approved | dismissed
  transaction_id    UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- never create two drafts from the same email
  UNIQUE (user_id, email_message_id)
);

ALTER TABLE transaction_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "td_all" ON transaction_drafts;
CREATE POLICY "td_all" ON transaction_drafts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT ALL ON transaction_drafts TO authenticated;

CREATE INDEX IF NOT EXISTS idx_td_user_status ON transaction_drafts(user_id, status);
CREATE INDEX IF NOT EXISTS idx_td_msgid ON transaction_drafts(user_id, email_message_id);

-- 3. Merchant memory — once you tag a merchant, future drafts auto-fill
CREATE TABLE IF NOT EXISTS merchant_rules (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  merchant_pattern TEXT       NOT NULL,                     -- case-insensitive substring match
  default_name    TEXT,
  category_id     UUID REFERENCES categories(id) ON DELETE SET NULL,
  payee_id        UUID REFERENCES payees(id)     ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, merchant_pattern)
);

ALTER TABLE merchant_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mr_all" ON merchant_rules;
CREATE POLICY "mr_all" ON merchant_rules FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
GRANT ALL ON merchant_rules TO authenticated;
