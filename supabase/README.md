# Database migrations

Run these in the Supabase SQL Editor **in order**. Each file only needs to be
run once; all are written to be safe to re-run (or to fail loudly rather than
corrupt anything).

## Setting up a fresh database

Run everything below from top to bottom:

| Order | File | What it adds |
|---|---|---|
| 1 | `schema.sql` | Core: profiles, households, accounts, categories, transactions |
| 2 | `schema_v2.sql` … `schema_v5.sql` | Payees, bills, attachments, activity notes, account_balances view |
| 3 | `migration_v6.sql` | (incremental) |
| 4 | `migration_v7_budgets.sql` | Budgets |
| 5 | `migration_v9_recoverables.sql` | Recoverables: import batches, shipments, allocations |
| 6 | `migration_v10_invoices.sql` + `v10a` | Customer (GST) invoices + settings |
| 7 | `migration_v11_tds.sql` + `v12` | TDS tracking |
| 8 | `migration_v13_invoice_txn.sql` | Invoice → transaction link |
| 9 | `migration_v14_payroll.sql` + `v14a/b/c` | Payroll: employees, months, entries, slips |
| 10 | `migration_v15_suppliers.sql` | Suppliers, supplier invoices, bulk payment batches |
| 11 | `migration_v16_payroll_income.sql` | Payroll income/forex transaction links |
| 12 | `migration_v17_credit_due.sql` | Credit due tracking |
| 13 | `migration_v18` – `v20` | Contrast: billed flag, invoices, courier |
| 14 | `migration_v21` – `v22` | Email inbox integration (encrypted credentials) |
| 15 | `migration_v23_bills_currency.sql` | Bills currency |
| 16 | `migration_v24` – `v25` | Budgets v2, category seed |
| 17 | `migration_v26_supplier_recurring.sql` | Recurring supplier invoices |
| 18 | `migration_v27_invoice_txn_link.sql` | Personal bills, txn ↔ supplier invoice links |
| 19 | `migration_v28_invoice_links.sql` | Customer ↔ supplier invoice junction |
| 20 | `migration_v29_supplier_categories.sql` | Supplier categories |
| 21 | `migration_v30_recurring_autopay.sql` | Auto-pay for recurring invoices |
| 22 | `migration_v31_profitability.sql` | **Profitability page fast path** (one aggregate query) |
| 23 | `migration_v32_validation.sql` | **Data gatekeeper**: rejects impossible dates / negative amounts |
| 24 | `migration_v33_invoice_numbering.sql` | **Atomic invoice numbers**: no duplicates, no reuse |
| 25 | `migration_v34_dashboard.sql` | **Dashboard fast path**: all dashboard data in one query |
| 26 | `migration_v35_whatsapp.sql` | WhatsApp number on employees (salary slip sending) |
| 27 | `migration_v36_card_statements.sql` | **Credit cards**: statement day + bank statement amounts (hidden charges) |
| 28 | `migration_v37_card_payments.sql` | Card Pay button: links statement → transfer transaction (pay/unpay) |
| 29 | `migration_v38_slip_emailed.sql` | Tracks when each salary slip was emailed |
| 30 | `migration_v39_credit_accounts.sql` | **Credit cards & loans**: limit, principal, APR, EMI + rebuilds account_balances view |
| 31 | `migration_v40_account_types.sql` | More account types: Auto/Home/Business Loan + Chit (expands the type CHECK) |
| 32 | `migration_v41_drop_forex_split.sql` | Drop billing/expended forex columns (single market rate) |
| 33 | `migration_v42_transaction_inbox.sql` | **Transaction Inbox**: transaction_drafts, merchant_rules, accounts.matching_digits, monitored_senders.kind |
| 34 | `migration_v43_sender_default_account.sql` | Per-sender default account (for sources with no account number, e.g. Amazon Pay) |

Not in the table: `supabase_commission_migration.sql` (root folder) — commission
orders/styles; run after v15.

## Deprecated — do NOT run

- `migration_v8_logistics.sql.deprecated`
- `migration_v8b_analytics_view.sql.deprecated`
- `migration_v8c_gst.sql.deprecated`
- `migration_v8d_rls_fix.sql.deprecated`

These were replaced by the v9 recoverables design and are kept only for history.

## Notes

- `schema_complete.sql` is an older combined snapshot — prefer the ordered list
  above for a fresh setup, as it post-dates the snapshot.
- The app degrades gracefully if v31/v33 functions are missing (it falls back
  to slower/older logic), but v32's checks only exist once that migration runs.
- The household/family-sharing tables (`households`, `profiles.household_id`)
  still exist in the database but the feature was removed from the UI in
  June 2026. Harmless to keep; a future cleanup could drop them.
