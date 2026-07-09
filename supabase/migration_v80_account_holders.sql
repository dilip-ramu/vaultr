-- v80 — Account holders ("Users"): a reusable registry of people that bank
-- accounts (and later other records) can link to. One place for a person's
-- photo + KYC details + documents, so linked accounts share the same photo.

CREATE TABLE IF NOT EXISTS public.account_holders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id uuid,
  name         text NOT NULL,
  photo_url    text,
  pan          text,
  aadhaar      text,
  dob          date,
  phone        text,
  email        text,
  address      text,
  documents    jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{type,url,name}]
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.account_holders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_holders_rw ON public.account_holders;
CREATE POLICY account_holders_rw ON public.account_holders
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_holders TO authenticated;
GRANT ALL ON public.account_holders TO service_role;

-- Link an account to a holder (optional; free-text account_holder still works).
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS account_holder_id uuid REFERENCES public.account_holders(id) ON DELETE SET NULL;

-- Expose the link on the view the app reads (append at end).
CREATE OR REPLACE VIEW account_balances AS
SELECT
  a.id, a.user_id, a.household_id, a.created_by, a.name, a.type, a.currency,
  a.color, a.icon, a.include_in_net_worth, a.is_active, a.created_at,
  a.initial_balance, a.avatar_url, a.account_number, a.branch, a.ifsc_code,
  a.swift_code, a.bank_address, a.open_date, a.closing_date, a.statement_day,
  a.statement_due_day, a.credit_limit, a.loan_principal, a.interest_rate,
  a.emi_amount, a.custom_type_id,
  ct.name       AS custom_type_name,
  ct.color      AS custom_type_color,
  ct.icon       AS custom_type_icon,
  ct.avatar_url AS custom_type_avatar_url,
  a.last_reconciled_at,
  a.last_reconciled_balance,
  a.initial_balance +
    COALESCE(SUM(
      CASE
        WHEN t.type = 'income'   THEN  t.amount
        WHEN t.type = 'expense'  THEN -t.amount
        WHEN t.type = 'transfer' AND t.account_id    = a.id THEN -t.amount
        WHEN t.type = 'transfer' AND t.to_account_id = a.id THEN  t.amount
        ELSE 0
      END
    ), 0) AS balance,
  COUNT(t.id) AS transaction_count,
  a.account_holder,
  a.card_network,
  a.card_expiry_month,
  a.card_expiry_year,
  a.bank_customer_id,
  a.bank_logo_url,
  a.account_holder_id
FROM accounts a
LEFT JOIN custom_account_types ct ON ct.id = a.custom_type_id
LEFT JOIN transactions t ON (t.account_id = a.id OR t.to_account_id = a.id)
GROUP BY a.id, ct.name, ct.color, ct.icon, ct.avatar_url;

GRANT SELECT ON account_balances TO authenticated;
GRANT SELECT ON account_balances TO anon;

NOTIFY pgrst, 'reload schema';
