-- v149 — a member's own photograph
--
-- WHY A PRIVATE BUCKET
--
-- The app keeps company logos in a public bucket, which is right for a logo:
-- it is printed on invoices and meant to be seen. A member's face is not. It
-- goes in a private bucket and is served through a route that checks who is
-- asking — the member themselves, or the chit operator — exactly as a reply's
-- picture is.
--
-- Re-runnable.

ALTER TABLE chit_members
  -- Where the file sits in the private bucket. NULL means no photo.
  ADD COLUMN IF NOT EXISTS photo_path TEXT;

-- Private: no public URL will ever resolve.
INSERT INTO storage.buckets (id, name, public)
VALUES ('vaultr-member-photos', 'vaultr-member-photos', false)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
