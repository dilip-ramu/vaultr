-- v147 — the portal open to everyone, and a message when somebody joins
--
-- THREE CHANGES, ALL ASKED FOR
--
-- 1. PORTAL ON BY DEFAULT. v115 made it off, one member at a time, so that
--    adding somebody to a chit did not silently create an outside login. The
--    owner's decision is the opposite: every member should be able to see
--    their own passbook. The lock has not gone anywhere — the link identifies
--    a member and their own PIN proves it is them — so what changes is who is
--    offered the door, not how well it is bolted.
--
-- 2. A MESSAGE WHEN A MEMBER IS ADDED, and another when they join a chit.
--    Which message is the owner's choice, stored beside the rest of the
--    settings. Unset means nothing is sent, which is the behaviour today.
--
-- 3. THE SENDING IS DONE BY A DATABASE TRIGGER, not by the screen that adds
--    the member. A member can arrive from the members page, from a group's
--    member list, or from a spreadsheet import, and a welcome that only
--    works on one of those paths is worse than none. The trigger queues a
--    row in chit_scheduled_sends and the outbox sends it — the same path a
--    scheduled message takes, with the same guards against sending twice.
--
-- Re-runnable.

-- ── 1. Everybody gets a portal ──────────────────────────────────────────────
ALTER TABLE chit_members ALTER COLUMN portal_enabled SET DEFAULT true;
UPDATE chit_members SET portal_enabled = true WHERE portal_enabled = false;

-- ── 2. Which message to send, if any ────────────────────────────────────────
ALTER TABLE chit_settings
  -- Sent when a member is created. NULL means nothing is sent.
  ADD COLUMN IF NOT EXISTS welcome_template_id UUID
    REFERENCES chit_message_templates(id) ON DELETE SET NULL,
  -- Sent when a member is added to a chit.
  ADD COLUMN IF NOT EXISTS joined_template_id UUID
    REFERENCES chit_message_templates(id) ON DELETE SET NULL;

-- ── 3. The triggers ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION chit_queue_welcome() RETURNS TRIGGER AS $$
DECLARE tpl UUID;
BEGIN
  SELECT welcome_template_id INTO tpl FROM chit_settings WHERE user_id = NEW.user_id;
  IF tpl IS NOT NULL THEN
    INSERT INTO chit_scheduled_sends (user_id, template_id, scope, member_id, send_at)
    VALUES (NEW.user_id, tpl, 'member', NEW.id, NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION chit_queue_joined() RETURNS TRIGGER AS $$
DECLARE tpl UUID;
BEGIN
  SELECT joined_template_id INTO tpl FROM chit_settings WHERE user_id = NEW.user_id;
  IF tpl IS NOT NULL THEN
    INSERT INTO chit_scheduled_sends (user_id, template_id, scope, member_id, group_id, send_at)
    VALUES (NEW.user_id, tpl, 'member', NEW.member_id, NEW.group_id, NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_chit_welcome ON chit_members;
CREATE TRIGGER trg_chit_welcome
  AFTER INSERT ON chit_members
  FOR EACH ROW EXECUTE FUNCTION chit_queue_welcome();

DROP TRIGGER IF EXISTS trg_chit_joined ON chit_group_members;
CREATE TRIGGER trg_chit_joined
  AFTER INSERT ON chit_group_members
  FOR EACH ROW EXECUTE FUNCTION chit_queue_joined();

NOTIFY pgrst, 'reload schema';
