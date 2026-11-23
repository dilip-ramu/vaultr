-- v143 — pictures and files members send
--
-- WHY
--
-- A payment screenshot is the most common thing a chit member sends, and
-- until now it arrived as the word '[image]' with nothing to open.
--
-- WhatsApp does not deliver the picture to the webhook. It delivers an ID,
-- and the file is fetched with the same token that sends messages. So the id
-- is what is stored, and the file is fetched when somebody opens it — which
-- also keeps the webhook fast, and Meta retries a webhook that answers slowly.
--
-- Re-runnable.

ALTER TABLE chit_message_inbox
  -- Meta's id for the file. Not a URL: a URL from Meta expires in minutes.
  ADD COLUMN IF NOT EXISTS media_id TEXT,
  -- 'image' | 'document' | 'audio' | 'video' | 'sticker'
  ADD COLUMN IF NOT EXISTS media_kind TEXT,
  ADD COLUMN IF NOT EXISTS media_mime TEXT;

NOTIFY pgrst, 'reload schema';
