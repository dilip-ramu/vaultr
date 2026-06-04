-- ── Migration v31: Profitability aggregation RPC ────────────────────────────
-- Returns small per-day aggregates instead of raw rows, so the Profitability
-- page makes ONE cheap query instead of fetching entire tables.
--
-- kind   = 'expected' | 'actual'
-- side   = 'income' | 'expense'
-- source = customerInvoices | commission | payrollIncome | directIncome
--        | supplierInvoices | payrollSalaries | directExpense | actual
-- day    = due date for expected (fallback: document date); txn date for actual

CREATE OR REPLACE FUNCTION get_profitability_lines()
RETURNS TABLE (kind text, side text, source text, day date, amount numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
WITH linked_txns AS (
  SELECT transaction_id AS id FROM recoverable_invoices
    WHERE user_id = auth.uid() AND transaction_id IS NOT NULL
  UNION
  SELECT linked_transaction_id FROM commission_styles
    WHERE user_id = auth.uid() AND linked_transaction_id IS NOT NULL
  UNION
  SELECT linked_transaction_id FROM commission_orders
    WHERE user_id = auth.uid() AND linked_transaction_id IS NOT NULL
  UNION
  SELECT income_transaction_id FROM payroll_months
    WHERE user_id = auth.uid() AND income_transaction_id IS NOT NULL
  UNION
  SELECT forex_transaction_id FROM payroll_months
    WHERE user_id = auth.uid() AND forex_transaction_id IS NOT NULL
  UNION
  SELECT transaction_id FROM payroll_entries
    WHERE user_id = auth.uid() AND transaction_id IS NOT NULL
)

-- Expected income: customer invoices (excluding cancelled)
SELECT 'expected', 'income', 'customerInvoices',
       COALESCE(due_date, invoice_date), SUM(total)
FROM recoverable_invoices
WHERE user_id = auth.uid() AND status <> 'cancelled'
GROUP BY 4

UNION ALL
-- Expected income: commission (Incoming), excluding cancelled
SELECT 'expected', 'income', 'commission',
       COALESCE(cs.expected_payment_date, co.order_date), SUM(cs.commission_inr)
FROM commission_styles cs
JOIN commission_orders co ON co.id = cs.order_id
WHERE cs.user_id = auth.uid() AND cs.order_status <> 'cancelled' AND cs.commission_inr <> 0
GROUP BY 4

UNION ALL
-- Expected income: payroll income (received INR)
SELECT 'expected', 'income', 'payrollIncome',
       COALESCE(payment_date, (payroll_month || '-01')::date), SUM(received_inr)
FROM payroll_months
WHERE user_id = auth.uid() AND received_inr <> 0
GROUP BY 4

UNION ALL
-- Expected expense: payroll salaries
SELECT 'expected', 'expense', 'payrollSalaries',
       COALESCE(pm.payment_date, (pm.payroll_month || '-01')::date), SUM(pe.final_payable)
FROM payroll_entries pe
JOIN payroll_months pm ON pm.id = pe.payroll_month_id
WHERE pe.user_id = auth.uid() AND pe.final_payable <> 0
GROUP BY 4

UNION ALL
-- Expected expense: supplier invoices
SELECT 'expected', 'expense', 'supplierInvoices',
       COALESCE(due_date, invoice_date), SUM(amount)
FROM supplier_invoices
WHERE user_id = auth.uid()
GROUP BY 4

UNION ALL
-- Expected (both sides): transactions NOT linked to any document, so nothing
-- is counted twice (payroll/supplier/invoice/contrast txns are excluded here)
SELECT 'expected', t.type,
       CASE WHEN t.type = 'income' THEN 'directIncome' ELSE 'directExpense' END,
       t.date, SUM(t.amount)
FROM transactions t
WHERE t.user_id = auth.uid()
  AND t.type IN ('income', 'expense')
  AND t.bill_id IS NULL
  AND t.supplier_invoice_id IS NULL
  AND t.supplier_payment_batch_id IS NULL
  AND t.contrast_invoice_id IS NULL
  AND NOT t.is_contrast_billed
  AND NOT EXISTS (SELECT 1 FROM linked_txns lt WHERE lt.id = t.id)
GROUP BY 2, 3, 4

UNION ALL
-- Actual: every income/expense transaction (realised)
SELECT 'actual', t.type, 'actual', t.date, SUM(t.amount)
FROM transactions t
WHERE t.user_id = auth.uid() AND t.type IN ('income', 'expense')
GROUP BY 2, 4;
$$;

GRANT EXECUTE ON FUNCTION get_profitability_lines() TO authenticated;
