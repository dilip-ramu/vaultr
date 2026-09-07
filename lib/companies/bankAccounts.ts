// Which bank account a document prints. PURE where it can be, one query where
// it cannot.
//
// THE RULE, IN ONE PLACE
//
// A document names a company. It may also name one of that company's bank
// accounts. Resolution is:
//
//   1. the account the document names, if it still exists and belongs to that
//      company — a document keeps the account it was issued with, even after
//      the company's default moves;
//   2. otherwise the company's default account;
//   3. otherwise nothing.
//
// Note what is NOT in that list: another company's details. An invoice issued
// from one entity must never print a different entity's account number, because
// a customer paying it pays the wrong account. Printing no bank block is a
// nuisance; printing the wrong one is a misdirected payment. When a company has
// no account on file the block is simply absent, which is visible and fixable.

import type { SupabaseClient } from '@supabase/supabase-js'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface CompanyBankAccount {
  id: string
  company_id: string
  label: string | null
  bank_name: string | null
  account_name: string | null
  account_number: string | null
  ifsc: string | null
  swift_code: string | null
  branch: string | null
  is_default: boolean
  is_active: boolean
  sort_order: number
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

export function toBankFields(a: CompanyBankAccount | null | undefined): BankFields {
  if (!a) return { ...EMPTY_BANK }
  return {
    bank_name: [a.bank_name, a.branch].filter(Boolean).join(', ') || null,
    bank_account_name: a.account_name ?? null,
    bank_account_number: a.account_number ?? null,
    bank_ifsc: a.ifsc ?? null,
    swift_code: a.swift_code ?? null,
  }
}

/** How an account reads in a picker. Never the full number — the last four
 *  digits are enough to tell two accounts apart, and a screen someone is
 *  presenting from does not need the rest. */
export function accountLabel(a: CompanyBankAccount): string {
  if (a.label?.trim()) return a.label.trim()
  const tail = a.account_number?.trim().slice(-4)
  const bank = a.bank_name?.trim() || 'Bank account'
  return tail ? `${bank} ····${tail}` : bank
}

/** PURE: pick the right account from a company's list. Exported for tests. */
export function selectAccount(
  accounts: CompanyBankAccount[], companyId: string | null, chosenId: string | null,
): CompanyBankAccount | null {
  if (!companyId) return null
  const mine = accounts.filter(a => a.company_id === companyId)
  if (chosenId) {
    // A document keeps what it was issued with, active or not: reprinting an old
    // invoice must reproduce it, not quietly restate it with today's account.
    const named = mine.find(a => a.id === chosenId)
    if (named) return named
  }
  return mine.find(a => a.is_default) ?? null
}

/** Load a company's accounts. Active ones only unless `includeInactive`. */
export async function listBankAccounts(
  supabase: SupabaseClient, userId: string, companyId: string,
  includeInactive = false,
): Promise<CompanyBankAccount[]> {
  let q = supabase.from('company_bank_accounts').select('*')
    .eq('user_id', userId).eq('company_id', companyId)
  if (!includeInactive) q = q.eq('is_active', true)
  const { data } = await q.order('sort_order').order('created_at')
  return (data ?? []) as CompanyBankAccount[]
}

/**
 * The bank block for one document. Used by every print path so they cannot
 * drift apart — which is exactly how invoices ended up showing the wrong bank.
 */
export async function resolveDocumentBank(
  supabase: SupabaseClient, userId: string,
  companyId: string | null, chosenAccountId: string | null,
): Promise<{ fields: BankFields; account: CompanyBankAccount | null }> {
  if (!companyId) return { fields: { ...EMPTY_BANK }, account: null }
  // Inactive included on purpose: an old document may name a closed account.
  const accounts = await listBankAccounts(supabase, userId, companyId, true)
  const account = selectAccount(accounts, companyId, chosenAccountId)
  return { fields: toBankFields(account), account }
}
