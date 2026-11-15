-- ─────────────────────────────────────────────────────────────────────────────
-- v129 — How the pieces go into cartons
--
-- A garment order is sizes; a shipment is cartons. "400 pieces" does not tell
-- a supplier what to put in a box, so the purchase order has to carry the
-- packing — and it has to be followable by somebody on a packing floor who
-- was not in the conversation.
--
-- ONE SHAPE FOR FOUR CASES. A pack is a SET of contents, how many sets go in
-- one carton, and how many cartons:
--
--   Solid            one content row     20 × M of one style, 5 cartons
--   Assorted         several sizes       S1 M2 L2 XL1 of one style
--   Several sets     sets_per_carton 2   two of that assortment per box
--   Mixed styles     rows on two lines   one M polo + one M tee per box
--
-- Those are not four features; they are one calculation seen four ways, and
-- writing them separately would be four chances to get a carton count wrong.
--
-- A PACK BELONGS TO THE ORDER, NOT TO A LINE. A carton holding two styles is
-- a real thing people ship, and a row hanging off a single order line cannot
-- say it. So contents point at lines instead, from a table that sits above
-- them.
--
-- `contents` is jsonb: [{"line_id": "...", "size": "M", "qty": 1}, ...], the
-- pieces in ONE set. Read and written whole, never queried into. The line_id
-- inside it has no foreign key behind it, so the form strips contents whose
-- line has been deleted, and reconcilePacking flags any that survive that.
--
-- `kind` is stored even though the maths does not need it, for two reasons:
-- the word goes on the document the supplier reads, and it is the one rule
-- worth enforcing — a "solid" carton holding two things is not solid.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS order_packs;
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_packs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sort             int NOT NULL DEFAULT 1,

  kind             text NOT NULL DEFAULT 'assort' CHECK (kind IN ('solid','assort')),
  contents         jsonb NOT NULL DEFAULT '[]'::jsonb,
  sets_per_carton  numeric NOT NULL DEFAULT 1,
  cartons          numeric NOT NULL DEFAULT 0,
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN order_packs.contents IS
  'Pieces in ONE set: [{"line_id","size","qty"}]. Several rows = an assortment; rows on different lines = a carton mixing styles.';
COMMENT ON COLUMN order_packs.sets_per_carton IS
  'How many of the set go in one carton. 1 unless a box takes several assortments.';

ALTER TABLE order_packs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_packs_all ON order_packs;
CREATE POLICY order_packs_all ON order_packs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_packs TO authenticated;

CREATE INDEX IF NOT EXISTS order_packs_order_idx ON order_packs(order_id, sort);

NOTIFY pgrst, 'reload schema';
