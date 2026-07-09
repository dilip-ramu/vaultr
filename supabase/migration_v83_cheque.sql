-- v83 — Cheque printing module
-- A per-BANK cheque template (dimensions + positioned fields) calibrated once
-- against an uploaded blank-cheque image. Accounts link to a bank and inherit
-- its template, so same-bank accounts share one layout. At print time only the
-- positioned text is rendered onto the physical leaf as an exact-size PDF; the
-- background image is a design-time aid only.

create table if not exists banks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  logo_path text,
  -- cheque template
  cheque_width_mm  numeric,                       -- physical leaf width
  cheque_height_mm numeric,                       -- physical leaf height
  cheque_fields    jsonb not null default '[]'::jsonb,  -- ChequeField[] (mm coords + formatting)
  cheque_bg_path   text,                          -- calibration image (never used at print)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table banks enable row level security;
drop policy if exists banks_all on banks;
create policy banks_all on banks for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists banks_user_idx on banks(user_id);
grant select, insert, update, delete on public.banks to authenticated;

-- Accounts inherit their bank's cheque template.
alter table accounts add column if not exists bank_id uuid references banks(id) on delete set null;

-- Cheque metadata on the settling transaction (traceability lives on the
-- existing supplier_invoice_id / supplier_payment_batch_id links).
alter table transactions add column if not exists cheque_number  text;
alter table transactions add column if not exists cheque_pdf_path text;
