-- v82 — Per-directory accent colour
-- Customer / supplier / company / employee cards now render an Accounts-style
-- gradient face whose hue is user-chosen. A single hex is stored; the app
-- derives the dark/mid/light triad (see lib/card-gradient.ts). Nullable —
-- the card falls back to a per-directory default when unset.

alter table customers add column if not exists color text;
alter table suppliers add column if not exists color text;
alter table companies add column if not exists color text;
alter table employees add column if not exists color text;
