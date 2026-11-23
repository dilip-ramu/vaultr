-- v144 — remember what Meta actually approved
--
-- WHY
--
-- Meta approves a message with a fixed number of variables in it. Send it
-- with a different number and the send fails with error 132000, 'Number of
-- parameters does not match the expected number of params' — which is what
-- happened the first time a message was edited in the app after approval.
--
-- The app stored only the CURRENT wording, so it had no way of knowing it had
-- drifted from the approved one. These two columns are written only when Meta
-- accepts a submission, so they are a record of what Meta holds, not of what
-- somebody has since typed.
--
-- Re-runnable.

ALTER TABLE chit_message_templates
  -- The body as submitted, in the app's own {{field}} form.
  ADD COLUMN IF NOT EXISTS approved_body TEXT,
  -- The variables as submitted, in Meta's order.
  ADD COLUMN IF NOT EXISTS approved_variables JSONB;

-- Anything already approved: assume what is stored is what was sent, because
-- until now a save and a submit wrote the same thing.
UPDATE chit_message_templates
   SET approved_body = body, approved_variables = variables
 WHERE status = 'APPROVED' AND approved_body IS NULL;

NOTIFY pgrst, 'reload schema';
