-- v136 — write the WhatsApp templates in the app, submit them from the app
--
-- WHY
--
-- v135 stored only the NAME Meta knows each template by, on the assumption
-- that the wording was typed into WhatsApp Manager. Meta has a Message
-- Templates API, so the wording can be written here and submitted from here —
-- and, more to the point, VALIDATED here. A template is reviewed for up to 24
-- hours, and an approved one may be edited only 10 times in 30 days and once
-- in 24 hours, so a brace in the wrong place is expensive: you find out
-- tomorrow and you spend one of your edits fixing it.
--
-- The approved copy still lives at Meta, because that is what WhatsApp sends.
-- This table is where it is authored and where its state is remembered.
--
-- Re-runnable.

ALTER TABLE chit_message_templates
  -- The wording, with {{1}}, {{2}} where the figures go.
  ADD COLUMN IF NOT EXISTS body TEXT,
  ADD COLUMN IF NOT EXISTS footer TEXT,
  -- What each variable means and an example value, which Meta asks for.
  ADD COLUMN IF NOT EXISTS variables JSONB,
  -- DRAFT | PENDING | APPROVED | REJECTED | PAUSED | DISABLED
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'DRAFT',
  -- Meta's own id, needed to edit it later.
  ADD COLUMN IF NOT EXISTS meta_template_id TEXT,
  -- What we asked for, and what Meta actually assigned. These differ more
  -- often than anyone expects, and marketing costs roughly 7.5x utility, so
  -- both are kept rather than overwritten.
  ADD COLUMN IF NOT EXISTS category_requested TEXT NOT NULL DEFAULT 'UTILITY',
  ADD COLUMN IF NOT EXISTS category_assigned TEXT,
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
  -- When each edit was submitted, so the app can say how many are left before
  -- Meta's limit rather than discovering it on a refusal.
  ADD COLUMN IF NOT EXISTS edit_times JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
