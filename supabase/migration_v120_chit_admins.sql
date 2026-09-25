-- ─────────────────────────────────────────────────────────────────────────────
-- v120 — Admin logins limited to the chit module
--
-- THE PROBLEM THIS SOLVES
--
-- Every table in Inex is guarded by `auth.uid() = user_id`: a row is yours
-- because your id is stamped on it. That is why the app has never needed a
-- permissions system — there has only ever been one person. A second person
-- signing in therefore sees an EMPTY app, not your chit groups.
--
-- So giving someone chit-only access is not a matter of hiding menus. It needs
-- a grant the database understands, and it needs that grant to reach the chit
-- tables ONLY. Everything else — transactions, invoices, payroll, investments —
-- keeps the original rule untouched and stays invisible to them.
--
-- HOW IT WORKS
--
--   chit_admins           who may act inside whose chit books.
--   chit_has_access(u)    one function, used by every chit policy. SECURITY
--                         DEFINER so it can read chit_admins without recursing
--                         through chit_admins's own policies.
--
-- WHAT AN ADMIN STILL CANNOT DO, enforced here rather than in the app:
--   • delete a chit group — the group is the experiment's container, and
--     deleting it takes its auctions and collections with it;
--   • touch any non-chit table. The general ledger is written on their behalf
--     by a server route using the service role, after the grant is checked, so
--     transactions and accounts keep their owner-only policies.
--
-- ROLLBACK
--   Re-create the plain owner-only policies (the DO block below shows the exact
--   shape), then: DROP FUNCTION IF EXISTS chit_has_access(uuid);
--                 DROP TABLE IF EXISTS chit_admins;
-- ─────────────────────────────────────────────────────────────────────────────

-- ── If an earlier draft of v120 was already applied, carry it over ──────────
-- The table was called chit_staff and the top role was called "manager" before
-- the names were corrected. Nothing is lost; this just renames in place. On a
-- clean database every statement here is a no-op.
DO $$
BEGIN
  IF to_regclass('public.chit_staff') IS NOT NULL
     AND to_regclass('public.chit_admins') IS NULL THEN
    ALTER TABLE chit_staff RENAME TO chit_admins;
    ALTER TABLE chit_admins RENAME COLUMN staff_user_id TO admin_user_id;
  END IF;

  IF to_regclass('public.chit_admins') IS NOT NULL THEN
    ALTER TABLE chit_admins DROP CONSTRAINT IF EXISTS chit_staff_role_check;
    ALTER TABLE chit_admins DROP CONSTRAINT IF EXISTS chit_admins_role_check;
    UPDATE chit_admins SET role = 'partner' WHERE role = 'manager';
    ALTER TABLE chit_admins ALTER COLUMN role SET DEFAULT 'partner';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS chit_admins (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  admin_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name           text,
  email          text NOT NULL,
  role           text NOT NULL DEFAULT 'partner'
    CHECK (role IN ('partner', 'collector', 'viewer')),

  is_active      boolean NOT NULL DEFAULT true,
  -- The owner sets the first password, so it is known to someone other than the
  -- account holder until this clears on their first sign-in.
  must_change_password boolean NOT NULL DEFAULT true,
  last_seen_at   timestamptz,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (owner_user_id, admin_user_id)
);
CREATE INDEX IF NOT EXISTS chit_admins_admin_idx ON chit_admins (admin_user_id) WHERE is_active;

-- ── The one access rule ─────────────────────────────────────────────────────
-- SECURITY DEFINER because a policy on chit_members that reads chit_admins would
-- otherwise be filtered by chit_admins's own policy, and recurse. search_path is
-- pinned so the function cannot be redirected at a different table.
CREATE OR REPLACE FUNCTION chit_has_access(row_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_owner = auth.uid()
      OR EXISTS (
        SELECT 1 FROM chit_admins s
         WHERE s.owner_user_id = row_owner
           AND s.admin_user_id = auth.uid()
           AND s.is_active
      );
$$;

REVOKE ALL ON FUNCTION chit_has_access(uuid) FROM public;
GRANT EXECUTE ON FUNCTION chit_has_access(uuid) TO authenticated;

-- ── Widen the chit tables, and ONLY the chit tables ─────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'chit_members', 'chit_groups', 'chit_group_members',
    'chit_auctions', 'chit_collections', 'chit_receivables',
    'chit_bid_windows', 'chit_bids',
    'chit_portal_invites', 'chit_portal_sessions', 'chit_member_pins'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    -- Drop whatever policy shape an earlier migration left behind.
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_owner', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_access', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (chit_has_access(user_id)) WITH CHECK (chit_has_access(user_id))',
      t || '_access', t
    );
  END LOOP;
END $$;

-- Deleting a group takes its auctions and collections with it. That stays with
-- the owner, whatever the app's buttons allow.
DROP POLICY IF EXISTS chit_groups_owner_delete ON chit_groups;
CREATE POLICY chit_groups_owner_delete ON chit_groups
  AS RESTRICTIVE FOR DELETE USING (auth.uid() = user_id);

-- ── Who can see the admin list ──────────────────────────────────────────────
ALTER TABLE chit_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chit_admins_owner ON chit_admins;
CREATE POLICY chit_admins_owner ON chit_admins
  FOR ALL USING (auth.uid() = owner_user_id) WITH CHECK (auth.uid() = owner_user_id);

-- An admin may read their OWN grant and nothing else — the app needs it
-- to work out whose books they are in. They cannot edit it, so they cannot
-- promote themselves or reach another owner.
DROP POLICY IF EXISTS chit_admins_self_read ON chit_admins;
CREATE POLICY chit_admins_self_read ON chit_admins
  FOR SELECT USING (auth.uid() = admin_user_id);

-- Re-assert the role check after the rename block above may have dropped it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.chit_admins'::regclass AND conname = 'chit_admins_role_check'
  ) THEN
    ALTER TABLE chit_admins
      ADD CONSTRAINT chit_admins_role_check CHECK (role IN ('partner', 'collector', 'viewer'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
