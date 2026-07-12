-- ── Migration v103: DHL bills are courier bills ─────────────────────────────
--
-- Every supplier invoice from DHL Express is a courier charge. Categorising them
-- one by one is busywork, and an uncategorised bill is invisible to
-- Profitability and the courier/reimbursable flows.
--
-- 'Courier' is an exact value from INVOICE_CATEGORIES (lib/suppliers/types.ts) —
-- not a free-text guess. If that list ever changes, this string must change with
-- it.
--
-- Safety rails:
--   • Matches the supplier by name (ILIKE 'dhl%'), scoped to your own suppliers.
--   • Overwrites the category on ALL of that supplier's bills, including ones
--     already categorised as something else — that's what "make all of them
--     courier" means. If you'd rather only fill in the blanks, add:
--         AND (si.category IS NULL OR si.category = '')
--   • Safe to run repeatedly: it's idempotent.

-- Look first:
--   SELECT s.name, si.category, count(*)
--     FROM supplier_invoices si JOIN suppliers s ON s.id = si.supplier_id
--    WHERE s.name ILIKE 'dhl%'
--    GROUP BY 1, 2;

UPDATE supplier_invoices si
   SET category = 'Courier'
  FROM suppliers s
 WHERE s.id = si.supplier_id
   AND s.user_id = si.user_id
   AND s.name ILIKE 'dhl%';

-- Check it landed:
--   SELECT category, count(*)
--     FROM supplier_invoices si JOIN suppliers s ON s.id = si.supplier_id
--    WHERE s.name ILIKE 'dhl%'
--    GROUP BY 1;                       -- expect: Courier | <all of them>

-- ── And going forward ───────────────────────────────────────────────────────
-- A per-supplier default bill category, so the next DHL bill categorises itself
-- instead of you doing this again in a month. (suppliers.default_category_id
-- already exists but points at the TRANSACTION categories table — a different
-- thing entirely. This is the bill's own category text.)

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS default_invoice_category TEXT;

UPDATE suppliers
   SET default_invoice_category = 'Courier'
 WHERE name ILIKE 'dhl%';

NOTIFY pgrst, 'reload schema';
