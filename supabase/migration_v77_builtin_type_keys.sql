-- v77 — widen the builtin_account_type_overrides.type_key check constraint.
--
-- The original constraint (v6) only allowed the first seven built-in types.
-- ACCOUNT_TYPE_CONFIG has since gained auto_loan, home_loan, business_loan and
-- chit, so editing the colour/name of any of those failed with
-- "builtin_account_type_overrides_type_key_check". Rebuild the constraint to
-- cover every current built-in AccountType.

ALTER TABLE builtin_account_type_overrides
  DROP CONSTRAINT IF EXISTS builtin_account_type_overrides_type_key_check;

ALTER TABLE builtin_account_type_overrides
  ADD CONSTRAINT builtin_account_type_overrides_type_key_check
  CHECK (type_key IN (
    'checking','savings','credit','cash','investment','loan',
    'auto_loan','home_loan','business_loan','chit','other'
  ));
