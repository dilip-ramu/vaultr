// Idempotently mirror the existing transactions into a persisted double-entry
// general ledger (journal_entries + journal_lines). Reads transactions/accounts,
// writes ONLY the two ledger tables — never touches any existing write path, so
// it cannot affect billing, payroll, cheques, or transaction recording.
//
// Each run: inserts missing entries, replaces changed ones, deletes orphans.
// Unchanged entries keep their created_at, so the journal stays a real audit
// trail rather than being rebuilt from scratch every time.

import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface JournalLineRow { account_key: string; debit: number; credit: number }
export interface JournalEntryRow {
  id: string
  kind: string
  source_txn_id: string | null
  account_ref: string | null
  date: string
  memo: string | null
  created_at: string
  lines: JournalLineRow[]
}

interface Desired { key: string; kind: 'transaction' | 'opening'; source_txn_id: string | null; account_ref: string | null; date: string; memo: string; lines: JournalLineRow[] }

const sig = (lines: JournalLineRow[]) => lines.map(l => `${l.account_key}:${l.debit}:${l.credit}`).sort().join('|')

export async function syncLedger(sb: SupabaseClient, uid: string): Promise<JournalEntryRow[]> {
  const [accRes, txRes, exRes] = await Promise.all([
    sb.from('accounts').select('id, initial_balance, created_at').eq('user_id', uid),
    sb.from('transactions').select('id, type, account_id, to_account_id, amount, category_id, date, name').eq('user_id', uid),
    sb.from('journal_entries').select('id, kind, source_txn_id, account_ref, journal_lines(account_key, debit, credit)').eq('user_id', uid),
  ])
  const accounts = (accRes.data ?? []) as { id: string; initial_balance: number; created_at: string }[]
  const txns = (txRes.data ?? []) as { id: string; type: string; account_id: string | null; to_account_id: string | null; amount: number; category_id: string | null; date: string; name: string | null }[]
  const existing = (exRes.data ?? []) as { id: string; source_txn_id: string | null; account_ref: string | null; kind: string; journal_lines: JournalLineRow[] }[]

  // ── desired ledger ──
  const desired: Desired[] = []
  for (const a of accounts) {
    const ib = Number(a.initial_balance) || 0
    if (!ib) continue
    const acctK = `acct:${a.id}`
    const lines: JournalLineRow[] = ib >= 0
      ? [{ account_key: acctK, debit: ib, credit: 0 }, { account_key: 'equity:opening', debit: 0, credit: ib }]
      : [{ account_key: 'equity:opening', debit: -ib, credit: 0 }, { account_key: acctK, debit: 0, credit: -ib }]
    desired.push({ key: `op:${a.id}`, kind: 'opening', source_txn_id: null, account_ref: a.id, date: (a.created_at ?? '').slice(0, 10) || '2000-01-01', memo: 'Opening balance', lines })
  }
  for (const t of txns) {
    const amt = Math.abs(Number(t.amount) || 0)
    if (!amt) continue
    let lines: JournalLineRow[] | null = null
    if (t.type === 'transfer' && t.account_id && t.to_account_id) {
      lines = [{ account_key: `acct:${t.to_account_id}`, debit: amt, credit: 0 }, { account_key: `acct:${t.account_id}`, debit: 0, credit: amt }]
    } else if (t.type === 'income' && t.account_id) {
      lines = [{ account_key: `acct:${t.account_id}`, debit: amt, credit: 0 }, { account_key: `cat:${t.category_id ?? 'uncat-income'}`, debit: 0, credit: amt }]
    } else if (t.type !== 'transfer' && t.account_id) {
      lines = [{ account_key: `cat:${t.category_id ?? 'uncat-expense'}`, debit: amt, credit: 0 }, { account_key: `acct:${t.account_id}`, debit: 0, credit: amt }]
    }
    if (!lines) continue
    desired.push({ key: `tx:${t.id}`, kind: 'transaction', source_txn_id: t.id, account_ref: null, date: t.date, memo: t.name ?? '', lines })
  }

  // ── diff against what's persisted ──
  const exByKey = new Map<string, { id: string; sig: string }>()
  for (const e of existing) {
    const key = e.source_txn_id ? `tx:${e.source_txn_id}` : e.account_ref ? `op:${e.account_ref}` : `x:${e.id}`
    exByKey.set(key, { id: e.id, sig: sig(e.journal_lines ?? []) })
  }
  const desiredKeys = new Set(desired.map(d => d.key))
  const toDeleteIds: string[] = []
  for (const [key, v] of exByKey) if (!desiredKeys.has(key)) toDeleteIds.push(v.id)
  const toInsert: Desired[] = []
  for (const d of desired) {
    const ex = exByKey.get(d.key)
    if (!ex) toInsert.push(d)
    else if (ex.sig !== sig(d.lines)) { toDeleteIds.push(ex.id); toInsert.push(d) }
  }

  if (toDeleteIds.length) await sb.from('journal_entries').delete().in('id', toDeleteIds)
  if (toInsert.length) {
    const entRows = toInsert.map(d => ({ id: randomUUID(), user_id: uid, kind: d.kind, source_txn_id: d.source_txn_id, account_ref: d.account_ref, date: d.date, memo: d.memo }))
    await sb.from('journal_entries').insert(entRows)
    const lineRows = toInsert.flatMap((d, i) => d.lines.map(l => ({ entry_id: entRows[i].id, user_id: uid, account_key: l.account_key, debit: l.debit, credit: l.credit })))
    if (lineRows.length) await sb.from('journal_lines').insert(lineRows)
  }

  const finalRes = await sb.from('journal_entries')
    .select('id, kind, source_txn_id, account_ref, date, memo, created_at, journal_lines(account_key, debit, credit)')
    .eq('user_id', uid).order('date', { ascending: false }).order('created_at', { ascending: false })
  return ((finalRes.data ?? []) as (Omit<JournalEntryRow, 'lines'> & { journal_lines: JournalLineRow[] })[])
    .map(e => ({ id: e.id, kind: e.kind, source_txn_id: e.source_txn_id, account_ref: e.account_ref, date: e.date, memo: e.memo, created_at: e.created_at, lines: e.journal_lines ?? [] }))
}
