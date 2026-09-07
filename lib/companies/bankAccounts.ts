// Which of YOUR OWN bank accounts a document prints.
//
// The accounts are the ones already on the Accounts page — the same rows whose
// balances you reconcile. They carry account_number, ifsc_code, branch and
// swift_code, and since v100 they carry company_id. Nothing here re-types them:
// a second copy of an account number is a second thing to keep correct, and it
// would be wrong the first time either copy was edited.
//
// RESOLUTION, in order:
//   1. the account the document names, if it belongs to that company — a
//      document keeps the account it was issued with, even after the company's
//      default moves, so reprinting an old invoice reproduces it;
//   2. otherwise the company's default account;
//   3. otherwise nothing.
//
// What is deliberately NOT in that list is another company's account. An
// invoice issued from one entity printing a different entity's account number
// sends the customer's money to the wrong place. Printing no bank block is a
// nuisance; printing the wrong one is a misdirected payment.

import type { SupabaseClient } from '@supabase/supabase-js'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** An account as the billing code needs it. A subset of the accounts table. */
export interface BillingAccount {
  id: string
  company_id: string | null
  name: string
  account_number: string | null
  ifsc_code: string | null
  swift_code: string | null
  branch: string | null
  account_holder: string | null
  is_active: boolean
}

/** The shape the document adapters already expect. */
export interface BankFields {
  bank_name: string | null
  bank_account_name: string | null
  bank_account_number: string | null
  bank_ifsc: string | null
  swift_code: string | null
}

export const EMPTY_BANK: BankFields = {
  bank_name: null, bank_account_name: null, bank_account_number: null,
  bank_ifsc: null, swift_code: null,
}

/** The columns to select from `accounts` wherever billing needs one. */
export const BILLING_ACCOUNT_COLUMNS =
  'id, company_id, name, account_number, ifsc_code, swift_code, branch, account_holder, is_active'

export function toBankFields(a: BillingAccount | null | undefined): BankFields {
  if (!a) return { ...EMPTY_BANK }
  return {
    bank_name: [a.name, a.branch].filter(Boolean).join(', ') || null,
    bank_account_name: a.account_holder ?? null,
    bank_account_number: a.account_number ?? null,
    bank_ifsc: a.ifsc_code ?? null,
    swift_code: a.swift_code ?? null,
  }
}

/** How an account reads in a picker. Never the full number — the last four
 *  digits distinguish two accounts, and a screen someone may be presenting
 *  from does not need the rest. */
export function accountLabel(a: BillingAccount): string {
  const tail = a.account_number?.trim().slice(-4)
  return tail ? `${a.name} ····${tail}` : a.name
}

/** PURE: pick the right account. Exported so the rule can be tested without a
 *  database, because it is the rule that decides where money is sent. */
export function selectAccount(
  accounts: BillingAccount[],
  companyId: string | null,
  chosenId: string | null,
  companyDefaultId: string | null,
): BillingAccount | null {
  if (!companyId) return null
  const mine = accounts.filter(a => a.company_id === companyId)
  if (chosenId) {
    const named = mine.find(a => a.id === chosenId)
    if (named) return named          // inactive included: history must reprint
  }
  if (companyDefaultId) {
    const fallback = mine.find(a => a.id === companyDefaultId)
    if (fallback) return fallback
  }
  return null
}

/** Accounts assigned to a company. Active only unless `includeInactive`. */
export async function listBillingAccounts(
  supabase: SupabaseClient, userId: string, companyId: string, includeInactive = false,
): Promise<BillingAccount[]> {
  let q = supabase.from('accounts').select(BILLING_ACCOUNT_COLUMNS)
    .eq('user_id', userId).eq('company_id', companyId)
  if (!includeInactive) q = q.eq('is_active', true)
  const { data } = await q.order('name')
  return (data ?? []) as unknown as BillingAccount[]
}

/**
 * The bank block for one document. Every print path goes through here so they
 * cannot drift apart — which is exactly how invoices ended up showing the bank
 * of a company they were not issued from.
 */
export async function resolveDocumentBank(
  supabase: SupabaseClient, userId: string,
  companyId: string | null, chosenAccountId: string | null,
): Promise<{ fields: BankFields; account: BillingAccount | null }> {
  if (!companyId) return { fields: { ...EMPTY_BANK }, account: null }

  const [{ data: company }, accounts] = await Promise.all([
    supabase.from('companies').select('default_bank_account_id')
      .eq('id', companyId).eq('user_id', userId).maybeSingle(),
    // Inactive included: an old document may name an account since closed.
    listBillingAccounts(supabase, userId, companyId, true),
  ])

  const account = selectAccount(
    accounts, companyId, chosenAccountId,
    (company as any)?.default_bank_account_id ?? null,
  )
  return { fields: toBankFields(account), account }
}
