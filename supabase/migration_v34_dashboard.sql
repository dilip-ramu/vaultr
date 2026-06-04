-- ── Migration v34: dashboard in one query ────────────────────────────────────
-- The dashboard previously made ~15 separate requests to the database on every
-- load. This function returns all of that data in ONE round trip. The numbers
-- and rows are identical — each block below mirrors one of the old queries
-- exactly. The app keeps the old path as a fallback until this is run.

CREATE OR REPLACE FUNCTION get_dashboard_data(
  p_month_start  date,
  p_month_end    date,
  p_history_start date,
  p_today        date
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
SELECT jsonb_build_object(

  -- accounts (account_balances view, active only, by created_at)
  'accounts', (
    SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at), '[]'::jsonb)
    FROM account_balances a
    WHERE a.user_id = auth.uid() AND a.is_active
  ),

  -- 10 most recent transactions with account + category objects
  'recent_tx', (
    SELECT COALESCE(jsonb_agg(s.row_data ORDER BY s.d DESC, s.c DESC), '[]'::jsonb)
    FROM (
      SELECT tx.date AS d, tx.created_at AS c,
        to_jsonb(tx) || jsonb_build_object(
          'account', (
            SELECT jsonb_build_object('id', acc.id, 'name', acc.name, 'color', acc.color,
                                      'type', acc.type, 'custom_type_id', acc.custom_type_id)
            FROM accounts acc WHERE acc.id = tx.account_id
          ),
          'category', (
            SELECT jsonb_build_object('id', c2.id, 'name', c2.name, 'icon', c2.icon,
                                      'color', c2.color, 'avatar_url', c2.avatar_url)
            FROM categories c2 WHERE c2.id = tx.category_id
          )
        ) AS row_data
      FROM transactions tx
      WHERE tx.user_id = auth.uid()
      ORDER BY tx.date DESC, tx.created_at DESC
      LIMIT 10
    ) s
  ),

  -- current month transactions (type, amount, date)
  'monthly_tx', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('type', t.type, 'amount', t.amount, 'date', t.date)), '[]'::jsonb)
    FROM transactions t
    WHERE t.user_id = auth.uid() AND t.date BETWEEN p_month_start AND p_month_end
  ),

  -- profile
  'profile', (
    SELECT to_jsonb(p) FROM profiles p WHERE p.id = auth.uid()
  ),

  -- builtin account type overrides
  'overrides', (
    SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
    FROM builtin_account_type_overrides o WHERE o.user_id = auth.uid()
  ),

  -- active budgets with category object
  'budgets', (
    SELECT COALESCE(jsonb_agg(
      to_jsonb(b) || jsonb_build_object('category', (
        SELECT jsonb_build_object('id', c2.id, 'name', c2.name, 'icon', c2.icon,
                                  'color', c2.color, 'avatar_url', c2.avatar_url)
        FROM categories c2 WHERE c2.id = b.category_id
      ))
    ), '[]'::jsonb)
    FROM budgets b WHERE b.user_id = auth.uid() AND b.is_active
  ),

  -- this month's categorised transactions (for budget "spent" math)
  'budget_tx', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'category_id', t.category_id, 'amount', t.amount, 'payee_id', t.payee_id, 'type', t.type)), '[]'::jsonb)
    FROM transactions t
    WHERE t.user_id = auth.uid()
      AND t.type IN ('expense', 'income')
      AND t.category_id IS NOT NULL
      AND t.date BETWEEN p_month_start AND p_month_end
  ),

  -- next 3 recurring pending bills with category object
  'upcoming_subs', (
    SELECT COALESCE(jsonb_agg(s.row_data ORDER BY s.dd ASC), '[]'::jsonb)
    FROM (
      SELECT b.due_date AS dd,
        to_jsonb(b) || jsonb_build_object('category', (
          SELECT jsonb_build_object('id', c2.id, 'name', c2.name, 'icon', c2.icon,
                                    'color', c2.color, 'avatar_url', c2.avatar_url)
          FROM categories c2 WHERE c2.id = b.category_id
        )) AS row_data
      FROM bills b
      WHERE b.user_id = auth.uid() AND b.is_recurring AND b.status = 'pending'
      ORDER BY b.due_date ASC
      LIMIT 3
    ) s
  ),

  -- 5-month history (chart + insights), max 300 rows
  'history_tx', (
    SELECT COALESCE(jsonb_agg(s.row_data ORDER BY s.d DESC), '[]'::jsonb)
    FROM (
      SELECT tx.date AS d,
        jsonb_build_object('id', tx.id, 'type', tx.type, 'amount', tx.amount,
                           'date', tx.date, 'name', tx.name,
          'category', (
            SELECT jsonb_build_object('id', c2.id, 'name', c2.name, 'icon', c2.icon,
                                      'color', c2.color, 'avatar_url', c2.avatar_url)
            FROM categories c2 WHERE c2.id = tx.category_id
          )) AS row_data
      FROM transactions tx
      WHERE tx.user_id = auth.uid() AND tx.date >= p_history_start
      ORDER BY tx.date DESC
      LIMIT 300
    ) s
  ),

  -- open customer receivables (rows; app sums them)
  'receivable_invoices', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('balance_due', r.balance_due)), '[]'::jsonb)
    FROM recoverable_invoices r
    WHERE r.user_id = auth.uid() AND r.status IN ('sent', 'overdue') AND r.balance_due > 0
  ),

  -- recoverable supplier invoices pending billing, with supplier name
  'unbilled_invoices', (
    SELECT COALESCE(jsonb_agg(s.row_data ORDER BY s.d DESC), '[]'::jsonb)
    FROM (
      SELECT si.invoice_date AS d,
        jsonb_build_object('id', si.id, 'amount', si.amount, 'invoice_date', si.invoice_date,
                           'linked_customer_name', si.linked_customer_name,
          'supplier', (SELECT jsonb_build_object('name', sup.name) FROM suppliers sup WHERE sup.id = si.supplier_id)
        ) AS row_data
      FROM supplier_invoices si
      WHERE si.user_id = auth.uid() AND si.is_recoverable AND si.recoverable_status = 'pending_billing'
      ORDER BY si.invoice_date DESC
    ) s
  ),

  -- contrast payee id (or null)
  'contrast_payee_id', (
    SELECT p.id FROM payees p
    WHERE p.user_id = auth.uid() AND p.name ILIKE 'contrast'
    LIMIT 1
  ),

  -- pending commission (rows; app sums)
  'commission_styles', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('commission_inr', cs.commission_inr, 'order_status', cs.order_status)), '[]'::jsonb)
    FROM commission_styles cs
    WHERE cs.user_id = auth.uid() AND cs.order_status NOT IN ('received', 'cancelled')
  ),

  -- commission due (shipped, expected payment date passed)
  'commission_due_styles', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('commission_inr', cs.commission_inr, 'expected_payment_date', cs.expected_payment_date)), '[]'::jsonb)
    FROM commission_styles cs
    WHERE cs.user_id = auth.uid() AND cs.order_status = 'shipped' AND cs.expected_payment_date <= p_today
  ),

  -- pending bills due today or earlier
  'due_bills', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'amount', b.amount, 'due_date', b.due_date)), '[]'::jsonb)
    FROM bills b
    WHERE b.user_id = auth.uid() AND b.status = 'pending' AND b.due_date <= p_today
  )
);
$$;

GRANT EXECUTE ON FUNCTION get_dashboard_data(date, date, date, date) TO authenticated;
