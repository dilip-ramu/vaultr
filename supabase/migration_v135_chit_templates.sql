-- v135 — one set of message templates, shared by every chit group
--
-- WHY A TABLE AND NOT CODE
--
-- The WORDING of a WhatsApp template does not live here at all. It lives at
-- Meta, in WhatsApp Manager: you submit the text once, Meta approves it, and
-- that approved text is what every member receives. Editing wording in this
-- app would change nothing about what WhatsApp sends.
--
-- What this app needs to store is the NAME Meta knows each template by, its
-- approved language, and the plain-text version used when a message is sent
-- by hand through a click-to-chat link. Those are worth a table rather than
-- code because they change without the shape of the app changing: a second
-- language, a renamed submission, a reworded link message.
--
-- ONE ROW PER MESSAGE KIND PER USER — not per group. All groups share them,
-- which is what was asked for: four templates, not four per group.
--
-- Rows are optional. With none, the app uses the defaults in
-- lib/chit/reminderTemplates.ts, so nothing has to be set up before the first
-- auction.
--
-- Re-runnable.

CREATE TABLE IF NOT EXISTS chit_message_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'notice' | 'dues' | 'winner' | 'reminder'. The three payment reminders
  -- share 'reminder': they differ in when they are sent, not in what they say.
  kind TEXT NOT NULL,
  -- What Meta knows it as, e.g. 'chit_payment_reminder'.
  template_name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  -- The wording for a message sent by hand. Not the WhatsApp template text,
  -- which Meta holds.
  link_text TEXT,
  -- Whether this one has been approved yet, so the app can say why a send is
  -- waiting rather than failing at Meta.
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One per kind per user: a second row for the same kind would make which
-- template gets used a matter of luck.
CREATE UNIQUE INDEX IF NOT EXISTS idx_chit_tpl_kind
  ON chit_message_templates(user_id, kind);

ALTER TABLE chit_message_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'chit_message_templates' AND policyname = 'Users can CRUD own chit templates'
  ) THEN
    CREATE POLICY "Users can CRUD own chit templates" ON chit_message_templates
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
