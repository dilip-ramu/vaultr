-- v88 — Issued documents (credit note, proforma invoice, purchase order,
-- delivery challan). Their own tables so they never touch the customer/supplier
-- invoice or billing logic. Rendered with the same customisable template engine
-- (document_templates, per company). Revert: drop the two tables.

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  doc_type text not null,                    -- credit_note | proforma_gst | purchase_order | delivery_challan
  company_id uuid references companies(id) on delete set null,
  party_kind text not null,                  -- 'customer' | 'supplier'
  party_id uuid,
  party_name text not null,
  party_address text,
  party_gstin text,
  party_state text,
  number text not null,
  date date not null,
  reference text,                            -- e.g. original invoice no. (credit note), PO ref, transport reason
  notes text,
  currency text not null default 'INR',
  subtotal numeric not null default 0,
  cgst_amount numeric not null default 0,
  sgst_amount numeric not null default 0,
  total numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table documents enable row level security;
drop policy if exists documents_all on documents;
create policy documents_all on documents for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists documents_user_idx on documents(user_id, doc_type, date desc);

create table if not exists document_lines (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  line_number int not null default 1,
  item text not null,
  hsn_sac text,
  qty numeric not null default 1,
  rate numeric not null default 0,
  amount numeric not null default 0,
  gst_rate numeric not null default 0,
  cgst_amount numeric not null default 0,
  sgst_amount numeric not null default 0
);
alter table document_lines enable row level security;
drop policy if exists document_lines_all on document_lines;
create policy document_lines_all on document_lines for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists document_lines_doc_idx on document_lines(document_id);

grant select, insert, update, delete on public.documents to authenticated;
grant select, insert, update, delete on public.document_lines to authenticated;
