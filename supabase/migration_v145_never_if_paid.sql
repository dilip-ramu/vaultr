-- v145 — a payment reminder never reaches somebody who has paid
--
-- WHY A COLUMN AND NOT A RULE IN CODE
--
-- The schedule already skips members who have paid, because the step says the
-- message is for 'members who still owe'. That is a dropdown, and a dropdown
-- is one careless click away from chasing sixty people who have already paid
-- — which on WhatsApp is how a business gets reported, and a reported number
-- loses delivery for every member, not just the one who complained.
--
-- So it becomes a property of the MESSAGE, enforced wherever a send happens:
-- the daily run, the queue, and the manual button. Not advice. A rule.
--
-- It is not simply 'audience = unpaid', because the dues announcement after an
-- auction uses the same figures and SHOULD reach a member who paid early. The
-- two are different intentions, so the intention is stored.
--
-- Re-runnable.

ALTER TABLE chit_message_templates
  ADD COLUMN IF NOT EXISTS never_if_paid BOOLEAN NOT NULL DEFAULT FALSE;

-- Anything already written for members who still owe is a chase by intent.
UPDATE chit_message_templates
   SET never_if_paid = TRUE
 WHERE audience = 'unpaid' AND never_if_paid = FALSE;

NOTIFY pgrst, 'reload schema';
