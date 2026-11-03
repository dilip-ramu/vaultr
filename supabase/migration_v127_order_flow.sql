-- ─────────────────────────────────────────────────────────────────────────────
-- v127 — Orders become a flow: files, size breakdowns, line descriptions
--
-- Three things the order page needs to be the one place a trade is run from.
--
-- 1. FILES. A job arrives as attachments — the customer's PO, a tech pack,
--    artwork, a size chart — and goes out as attachments to the supplier. They
--    were living in email. Each file is tagged with the side it belongs to,
--    because the whole point is being able to hand the supplier everything
--    meant for them, and nothing meant for the customer.
--
-- 2. SIZE BREAKDOWN. A garment line is never one quantity. It is S 200, M 400,
--    L 400, XL 200, and the supplier needs that breakdown or the order cannot
--    be made. Sub-rows rather than a text field, so the quantities add up and
--    the app can check that they match the line.
--
-- 3. DESCRIPTION. `item` is a short name that has to fit a table column. The
--    real spec — GSM, wash, trims, labelling — needs room, and typing it into
--    the order's notes loses which line it belongs to.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS order_line_sizes;
--   DROP TABLE IF EXISTS order_files;
--   ALTER TABLE order_lines DROP COLUMN IF EXISTS description;
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Files, tagged by the side they belong to ─────────────────────────────
CREATE TABLE IF NOT EXISTS order_files (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- 'customer' = came from the customer or goes to them.
  -- 'supplier' = goes to the supplier, and so goes in the supplier pack.
  side        text NOT NULL CHECK (side IN ('customer','supplier')),
  name        text NOT NULL,           -- the name as uploaded, shown and used in the zip
  path        text NOT NULL,           -- key in the vaultr-attachments bucket
  size        bigint NOT NULL DEFAULT 0,
  mime        text,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Size-wise quantities under a line ────────────────────────────────────
-- When a line has sizes, THEY are the quantity: order_lines.qty is kept in
-- step with their sum rather than typed, so the two can never disagree on the
-- document that goes to the supplier.
CREATE TABLE IF NOT EXISTS order_line_sizes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  line_id     uuid NOT NULL REFERENCES order_lines(id) ON DELETE CASCADE,
  order_id    uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sort        int NOT NULL DEFAULT 1,
  label       text NOT NULL,           -- S, M, L, XL, 'Age 3-4', whatever is used
  qty         numeric NOT NULL DEFAULT 0,
  shipped_qty numeric NOT NULL DEFAULT 0
);

-- ── 3. Room for the actual spec ─────────────────────────────────────────────
ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS description text;
COMMENT ON COLUMN order_lines.description IS
  'The long spec for this line — GSM, wash, trims, labelling. `item` stays the short name.';

-- ── Security ────────────────────────────────────────────────────────────────
ALTER TABLE order_files      ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_line_sizes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS order_files_all      ON order_files;
DROP POLICY IF EXISTS order_line_sizes_all ON order_line_sizes;

CREATE POLICY order_files_all      ON order_files      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY order_line_sizes_all ON order_line_sizes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_files      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_line_sizes TO authenticated;

CREATE INDEX IF NOT EXISTS order_files_order_idx      ON order_files(order_id, side);
CREATE INDEX IF NOT EXISTS order_line_sizes_line_idx  ON order_line_sizes(line_id, sort);
CREATE INDEX IF NOT EXISTS order_line_sizes_order_idx ON order_line_sizes(order_id);

NOTIFY pgrst, 'reload schema';
