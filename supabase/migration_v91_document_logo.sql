-- ── Migration v91: separate document logo ───────────────────────────────────
-- The company logo used in the app can differ from the logo printed on invoices
-- and other PDFs. This adds an optional `document_logo_path` (PUBLIC
-- vaultr-avatars bucket). PDFs use it when set, else fall back to logo_path.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS document_logo_path TEXT;
