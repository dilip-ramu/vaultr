-- ── Migration v102: give every existing supplier bill a company ─────────────
--
-- supplier_invoices.company_id only arrived with v98, so every bill entered
-- before that is NULL — it belongs to no company, and shows up in no company's
-- payables. The company view then reads ₹0 payable while real unpaid bills sit
-- there, which is not "empty", it's wrong.
--
-- This assigns every UNASSIGNED bill to Contrast Company.
--
-- Two deliberate safety rails:
--   • It only touches rows where company_id IS NULL. A bill you have already
--     assigned to another company is never re-pointed.
--   • It matches the company by name (ILIKE 'contrast%') per user. If you have
--     no such company the UPDATE simply affects 0 rows rather than guessing.
--
-- Safe to run more than once: after the first run there are no NULLs left to
-- match, so a second run is a no-op.

-- What it's about to do (run this first if you want to look before you leap):
--   SELECT count(*) FROM supplier_invoices WHERE company_id IS NULL;

UPDATE supplier_invoices si
   SET company_id = c.id
  FROM companies c
 WHERE si.company_id IS NULL
   AND c.user_id = si.user_id
   AND c.name ILIKE 'contrast%';

-- Make Contrast the default company, so new supplier bills (and anything else
-- that follows the default) land there without being asked.
-- Exactly one default per user: clear the old one first.
UPDATE companies
   SET is_default = false
 WHERE is_default = true
   AND user_id IN (SELECT user_id FROM companies WHERE name ILIKE 'contrast%');

UPDATE companies
   SET is_default = true
 WHERE name ILIKE 'contrast%';

-- Check it landed:
--   SELECT name, is_default FROM companies;
--   SELECT count(*) FROM supplier_invoices WHERE company_id IS NULL;   -- expect 0
