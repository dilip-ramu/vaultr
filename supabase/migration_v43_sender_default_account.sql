-- ── Migration v43: per-sender default account ────────────────────────────────
-- Some sources (Amazon Pay, wallets) don't put an account number in the email.
-- A monitored sender can point at a default account so its drafts route there.
ALTER TABLE monitored_senders
  ADD COLUMN IF NOT EXISTS default_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;
