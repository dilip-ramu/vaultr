-- ── Migration v48: drop auto-created "Me" payees that aren't actually used ──
-- Migration v46 inserted a "Me" payee per user as a convenience. For users
-- who already had a self-payee (e.g. their own name like "Dilip"), this
-- showed up as a duplicate in the payee dropdown.
--
-- Safe cleanup: delete any payee named "Me" that has NO transactions pointing
-- at it AND isn't linked to a customer. If the user has touched their "Me"
-- payee or it's been used on a transaction, we leave it alone.

DELETE FROM payees p
 WHERE p.name = 'Me'
   AND p.customer_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.payee_id = p.id);
