-- ── Migration v57: invoice logo + signature move to Supabase Storage ─────────
-- Public/ was serving two sensitive branding assets — a company logo and an
-- authorised signature — world-readable at guessable URLs. Anyone who typed
-- /invoice-logo.png (formerly /Contrast.png) or /signedcopy.png could
-- download them. The signature is the higher-risk file: a real scanned
-- signature could be lifted onto a fake document.
--
-- Fix: keep the paths per-user in recoverable_invoice_settings, store the
-- files in the private vaultr-attachments bucket, and render them from
-- signed URLs generated server-side by the print page. The file itself
-- never becomes URL-accessible without a valid short-lived signature.
--
-- ── Uploading the files after this ships ─────────────────────────────────────
-- 1. Supabase → Storage → vaultr-attachments → open the folder named after
--    your auth user id (uuid) — create it if it doesn't exist.
-- 2. Upload invoice-logo.png and signedcopy.png into that folder.
-- 3. Run in SQL editor (once), with your uid substituted:
--       UPDATE recoverable_invoice_settings
--       SET logo_path      = '<your-uid>/invoice-logo.png',
--           signature_path = '<your-uid>/signedcopy.png'
--       WHERE user_id      = '<your-uid>';
-- 4. Regenerate any recent invoice PDF — the logo + signature should reappear.
-- Until step 3 runs, the printed invoice renders without a logo or signature.
-- That's the intended fallback — printable, just missing the branding.

ALTER TABLE recoverable_invoice_settings
  ADD COLUMN IF NOT EXISTS logo_path      TEXT,
  ADD COLUMN IF NOT EXISTS signature_path TEXT;

NOTIFY pgrst, 'reload schema';
