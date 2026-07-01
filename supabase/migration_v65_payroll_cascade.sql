-- ── Migration v65: payroll cascade + reimbursement payment triggers ─────────
-- Restructure Deploy 3.
--
-- Behaviour change (was manual, now automatic):
--   Marking a reimbursement invoice as `paid` should:
--     1. Cascade the courier tax invoices bundled inside it to `paid` too
--        (customer paid the reimbursement invoice → they've paid the bundled
--        courier lines, no separate settlement needed).
--     2. Unlock the linked payroll month for processing — the salary lines
--        inside the reimbursement were expected to be paid AFTER the customer
--        pays us, not before.
--
-- Schema changes:
--   • payroll_months.status TEXT (pending | ready_to_process | finalized)
--     Backfilled from is_finalized. is_finalized column kept for backward
--     compat and auto-synced by trigger.
--   • Trigger `trg_cascade_reimbursement_paid` on recoverable_invoices —
--     fires only when a reimbursement invoice's status flips to 'paid'.

-- ── 1. payroll_months.status ────────────────────────────────────────────

ALTER TABLE payroll_months
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

-- Loosen any old CHECK, add ours.
ALTER TABLE payroll_months
  DROP CONSTRAINT IF EXISTS payroll_months_status_check;
ALTER TABLE payroll_months
  ADD  CONSTRAINT payroll_months_status_check
  CHECK (status IN ('pending','ready_to_process','finalized'));

-- Backfill status from the existing is_finalized boolean.
UPDATE payroll_months
   SET status = CASE WHEN is_finalized THEN 'finalized' ELSE 'pending' END
 WHERE status = 'pending';   -- only rows that still have the default

-- Keep is_finalized in sync with status so legacy queries don't drift.
CREATE OR REPLACE FUNCTION sync_payroll_month_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- status → is_finalized (source-of-truth is status going forward)
  NEW.is_finalized := (NEW.status = 'finalized');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_payroll_month_status ON payroll_months;
CREATE TRIGGER trg_sync_payroll_month_status
  BEFORE INSERT OR UPDATE ON payroll_months
  FOR EACH ROW EXECUTE FUNCTION sync_payroll_month_status();

-- ── 2. Cascade trigger on recoverable_invoices ──────────────────────────

CREATE OR REPLACE FUNCTION cascade_reimbursement_paid()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Fire only when a reimbursement invoice's status transitions INTO 'paid'.
  IF NEW.invoice_type = 'reimbursement'
     AND NEW.status   = 'paid'
     AND (OLD.status IS DISTINCT FROM 'paid') THEN

    -- 2a. Mark every courier tax invoice bundled inside this reimbursement
    --     as paid. The bundling FK is contrast_invoice_id (legacy name; will
    --     be renamed in a later deploy).
    --
    --     Skip rows already paid/cancelled so we don't stomp on manual
    --     settlements. invoice_type filter avoids selecting reimbursement
    --     rows that happen to reference each other (rare, but defensive).
    UPDATE recoverable_invoices
       SET status      = 'paid',
           paid_amount = total,
           balance_due = 0,
           paid_at     = COALESCE(NEW.paid_at, NOW()),
           updated_at  = NOW()
     WHERE contrast_invoice_id = NEW.id
       AND user_id             = NEW.user_id
       AND invoice_type        = 'tax_invoice'
       AND status NOT IN ('paid','cancelled');

    -- 2b. Unlock the linked payroll month for processing. Only rows still
    --     pending — don't clobber a month someone already finalized.
    UPDATE payroll_months
       SET status = 'ready_to_process'
     WHERE contrast_invoice_id = NEW.id
       AND user_id             = NEW.user_id
       AND status              = 'pending';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cascade_reimbursement_paid ON recoverable_invoices;
CREATE TRIGGER trg_cascade_reimbursement_paid
  AFTER UPDATE OF status ON recoverable_invoices
  FOR EACH ROW EXECUTE FUNCTION cascade_reimbursement_paid();

NOTIFY pgrst, 'reload schema';

-- ── VERIFICATION ────────────────────────────────────────────────────────
-- After running, quick sanity queries:
--
--   -- 1. Every existing payroll month has a valid status:
--   SELECT status, COUNT(*) FROM payroll_months GROUP BY status;
--
--   -- 2. is_finalized aligns with status:
--   SELECT status, is_finalized, COUNT(*) FROM payroll_months
--   GROUP BY status, is_finalized;
--   -- Should show only:
--   --   pending          | false | N
--   --   ready_to_process | false | N   (0 initially — filled by cascade)
--   --   finalized        | true  | N
--
--   -- 3. To test the cascade — take a reimbursement invoice that's not yet
--   --    paid and flip it. Watch its linked courier invoices + payroll month.
