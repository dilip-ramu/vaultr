-- ─────────────────────────────────────────────────────────────────────────────
-- v124 — Credit a member is holding, and moving it between their chits
--
-- WHAT CHANGED IN THE MODEL
--
-- Dues used to be a yes/no question per slot: a collection row existed, or it
-- did not. That breaks the moment somebody pays the wrong amount. Someone
-- handing over ₹20,000 against an ₹18,600 due was marked paid and the extra
-- ₹1,400 sat in the bank with nothing pointing at it; someone paying ₹10,000
-- could not be recorded at all without claiming they had paid in full.
--
-- The question is now "paid how much against owed how much", and the answer is
-- computed from the collection rows that already exist. NO CREDIT BALANCE IS
-- STORED. A stored balance is a number that can drift from the payments it came
-- from, and when it does, nobody can tell which one is lying.
--
-- WHAT THIS TABLE IS FOR
--
-- One person can be in several chits, and credit belongs to the PERSON. If they
-- are ahead in one chit, that money should be usable against another — once,
-- and against whichever the owner chooses, not automatically whichever happens
-- to be listed first.
--
-- So a move is recorded explicitly: this much of this member's credit, out of
-- that chit, into this one, against that month. The chit it left stops counting
-- it; the chit it arrived in counts it as money received. Because the move is
-- one row, it cannot be spent twice.
--
-- Append-mostly: a move can be deleted (it was a mistake) but not edited into a
-- different amount, because a half-corrected transfer is how money goes missing.
--
-- ROLLBACK
--   DROP TABLE IF EXISTS chit_credit_moves;
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS chit_credit_moves (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id      uuid NOT NULL REFERENCES chit_members(id) ON DELETE CASCADE,

  from_group_id  uuid NOT NULL REFERENCES chit_groups(id) ON DELETE CASCADE,
  to_group_id    uuid NOT NULL REFERENCES chit_groups(id) ON DELETE CASCADE,
  -- The month in the RECEIVING chit that this credit is applied to.
  to_month       integer NOT NULL CHECK (to_month >= 1),

  amount         numeric(14,2) NOT NULL CHECK (amount > 0),
  note           text,

  recorded_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_by_name    text,
  created_at     timestamptz NOT NULL DEFAULT now(),

  -- Moving credit from a chit into itself is not a transfer, it is a typo.
  CONSTRAINT chit_credit_moves_different_groups CHECK (from_group_id <> to_group_id)
);

CREATE INDEX IF NOT EXISTS chit_credit_moves_member_idx
  ON chit_credit_moves (user_id, member_id);
CREATE INDEX IF NOT EXISTS chit_credit_moves_to_idx
  ON chit_credit_moves (to_group_id, member_id, to_month);

-- The amount is the record. Correcting one means deleting it and making
-- another, so that the history shows what actually happened.
CREATE OR REPLACE FUNCTION chit_credit_moves_no_edit() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'chit_credit_moves cannot be edited: delete the move and record a new one';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chit_credit_moves_no_edit_trg ON chit_credit_moves;
CREATE TRIGGER chit_credit_moves_no_edit_trg
  BEFORE UPDATE ON chit_credit_moves
  FOR EACH ROW EXECUTE FUNCTION chit_credit_moves_no_edit();

-- Same access rule as every other chit table (v120).
ALTER TABLE chit_credit_moves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chit_credit_moves_access ON chit_credit_moves;
CREATE POLICY chit_credit_moves_access ON chit_credit_moves
  FOR ALL USING (chit_has_access(user_id)) WITH CHECK (chit_has_access(user_id));

NOTIFY pgrst, 'reload schema';
