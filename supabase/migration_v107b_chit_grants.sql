-- v107b — grant table access to the chit_* tables
--
-- "permission denied for table chit_groups" is NOT an RLS problem — RLS denies
-- by returning no rows, never that error. It means the logged-in role
-- (`authenticated`) has no table-level privilege at all.
--
-- Supabase auto-grants privileges to anon/authenticated ONLY for tables created
-- through its dashboard or SQL editor with the right owner. Tables created by a
-- raw migration can miss those default privileges, so we grant them explicitly.
-- RLS is still on and still restricts every row to its owner — this only opens
-- the door far enough for RLS to do its job.
--
-- Safe to run more than once.

GRANT ALL ON TABLE
  chit_members, chit_groups, chit_group_members,
  chit_auctions, chit_collections, chit_receivables
TO authenticated, service_role;

-- Belt and braces: make sure future chit tables in this schema inherit the same,
-- so the next migration doesn't hit the same wall.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO authenticated, service_role;
