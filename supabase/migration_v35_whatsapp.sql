-- ── Migration v35: WhatsApp number on employees ──────────────────────────────
-- Used by the "Send via WhatsApp" buttons on the Salary Slips page.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;
