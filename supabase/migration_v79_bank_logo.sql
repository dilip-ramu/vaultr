-- v79 — Bank logo per account.
-- A separate image from the account's identity avatar (account_holder photo),
-- used on the accounts page + the shareable "bank details" card.

alter table public.accounts add column if not exists bank_logo_url text;
