'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, Pencil, Trash2, ArrowLeftRight, Scale, CreditCard } from 'lucide-react'
import type { Account } from '@/lib/types'
import { ACCOUNT_TYPE_CONFIG } from '@/lib/types'
import { formatCurrency, getRelativeDate } from '@/lib/utils'
import type { ReconTxn } from '@/lib/reconcile'
import type { CardTxn } from '@/lib/cards'
import { createClient } from '@/lib/supabase/client'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { notify } from '@/components/shared/Toast'
import AccountReconcilePanel from './AccountReconcilePanel'
import { SingleCard, type StatementRow } from '../cards/CardsClient'
import type { PickerAccount } from '../shared/AccountChipPicker'

type Tab = 'transactions' | 'reconcile' | 'charges'

function signedForAccount(t: ReconTxn, accountId: string): number {
  if (t.type === 'income') return t.amount
  if (t.type === 'expense') return -t.amount
  return t.to_account_id === accountId ? t.amount : -t.amount // transfer
}

export default function AccountDetailModal({
  account, txns, currencyById, today, onReconciled,
  cardTxns = [], cardStatements = [], payAccounts = [],
  onEdit, onDeleted, onClose,
}: {
  account: Account
  txns: ReconTxn[]
  currencyById: Record<string, string>
  today: string
  onReconciled?: (accountId: string, atIso: string, balance: number) => void
  cardTxns?: CardTxn[]
  cardStatements?: StatementRow[]
  payAccounts?: PickerAccount[]
  onEdit: (a: Account) => void
  onDeleted?: (id: string) => void
  onClose: () => void
}) {
  const router = useRouter()
  const isCredit = account.type === 'credit'
  // Match the account card exactly: custom type colour → account colour → built-in type colour.
  const builtinTypeColor = (ACCOUNT_TYPE_CONFIG[account.type] ?? ACCOUNT_TYPE_CONFIG.other).color
  const accent = account.custom_type_color ?? (account.color || builtinTypeColor)
  const [tab, setTab] = useState<Tab>('transactions')
  const [deleting, setDeleting] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Same guarded soft-delete as the old AccountCard: block if the account has
  // linked transactions, otherwise deactivate (is_active=false).
  async function handleDelete() {
    const supabase = createClient()
    const { data: count } = await supabase.rpc('get_account_transaction_count', { p_account_id: account.id })
    if ((count ?? 0) > 0) {
      notify(`Cannot delete "${account.name}" — it has ${count} linked transaction${count! > 1 ? 's' : ''}. Delete or move them first.`, 'error')
      router.push(`/transactions?account=${account.id}`)
      return
    }
    if (!await confirmDialog(`Delete "${account.name}"? This cannot be undone.`)) return
    setDeleting(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setDeleting(false); return }
    const { error } = await supabase.from('accounts').update({ is_active: false }).eq('id', account.id).eq('user_id', user.id)
    if (error) { notify('Could not delete account: ' + error.message, 'error'); setDeleting(false); return }
    onDeleted?.(account.id)
    onClose()
  }

  const accountTxns = txns
    .filter(t => t.account_id === account.id || t.to_account_id === account.id)
    .sort((a, b) => b.date.localeCompare(a.date))

  const tabs: { key: Tab; label: string; icon: typeof ArrowLeftRight }[] = [
    { key: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
    { key: 'reconcile', label: 'Reconcile', icon: Scale },
    ...(isCredit ? [{ key: 'charges' as Tab, label: 'Charges', icon: CreditCard }] : []),
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-stretch justify-center md:justify-end" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full md:w-1/3 md:min-w-[360px] md:h-full rounded-t-2xl md:rounded-none flex flex-col slide-up max-h-[92dvh] md:max-h-none overflow-hidden" style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)', borderLeft: '1px solid var(--border)' }}>
        {/* Accent bar — matches the account type colour */}
        <div className="shrink-0" style={{ height: 4, background: accent }} />
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `color-mix(in srgb, ${accent} 18%, transparent)`, color: accent }}><CreditCard className="w-[18px] h-[18px]" /></div>
            <div className="min-w-0">
              <h2 className="text-base font-bold truncate" style={{ color: 'var(--text)' }}>{account.name}</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{account.account_holder || account.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button onClick={() => onEdit(account)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }} title="Edit"><Pencil className="w-4 h-4" /></button>
            <button onClick={handleDelete} disabled={deleting} className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-50" style={{ background: 'var(--surface-2)', color: 'var(--expense)' }} title="Delete account"><Trash2 className="w-4 h-4" /></button>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}><X className="w-4 h-4" /></button>
          </div>
        </div>

        {isCredit ? (
        <>
        {/* Tabs (credit cards keep Transactions / Reconcile / Charges) */}
        <div className="flex gap-0.5 p-1 m-4 mb-0 rounded-xl shrink-0" style={{ background: 'var(--surface-2)' }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className="flex-1 flex items-center justify-center gap-1.5 text-[12.5px] font-bold py-2 rounded-lg transition-colors" style={tab === t.key ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: 'var(--shadow)' } : { color: 'var(--text-muted)' }}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4">
          {tab === 'transactions' && (
            accountTxns.length === 0 ? (
              <p className="text-sm text-center py-10" style={{ color: 'var(--text-muted)' }}>No transactions in this account yet.</p>
            ) : (
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                {accountTxns.slice(0, 100).map((t, i) => {
                  const amt = signedForAccount(t, account.id)
                  return (
                    <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-2.5" style={{ borderTop: i > 0 ? '1px solid var(--border-2)' : 'none' }}>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium truncate" style={{ color: 'var(--text)' }}>{t.name || (t.type === 'transfer' ? 'Transfer' : t.type)}</p>
                        <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{getRelativeDate(t.date)}</p>
                      </div>
                      <span className="text-[13px] font-bold shrink-0" style={{ color: amt >= 0 ? 'var(--income)' : 'var(--expense)', fontVariantNumeric: 'tabular-nums' }}>{amt >= 0 ? '+' : '−'}{formatCurrency(Math.abs(amt))}</span>
                    </div>
                  )
                })}
              </div>
            )
          )}

          {tab === 'reconcile' && (
            <AccountReconcilePanel
              account={{ id: account.id, name: account.name, currency: account.currency, initial_balance: account.initial_balance, balance: account.balance ?? null }}
              txns={txns}
              currencyById={currencyById}
              today={today}
              onReconciled={onReconciled}
            />
          )}

          {tab === 'charges' && (() => {
            const cardAccount = {
              id: account.id, name: account.name, color: account.color, avatar_url: account.avatar_url,
              initial_balance: account.initial_balance, statement_day: account.statement_day,
              statement_due_day: account.statement_due_day, credit_limit: account.credit_limit,
            }
            const myTxns = cardTxns.filter(t => t.account_id === account.id || t.to_account_id === account.id)
            const stmtRows: Record<string, StatementRow> = {}
            const bankAmounts: Record<string, number> = {}
            for (const s of cardStatements.filter(s => s.account_id === account.id)) {
              stmtRows[s.statement_date] = s
              if (s.bank_amount !== null) bankAmounts[s.statement_date] = Number(s.bank_amount)
            }
            return (
              <SingleCard
                card={cardAccount}
                txns={myTxns}
                bankAmounts={bankAmounts}
                stmtRows={stmtRows}
                payAccounts={payAccounts}
                onSaved={() => router.refresh()}
              />
            )
          })()}
        </div>
        </>
        ) : (
          /* Bank account: one merged view — app vs bank balance, difference,
             mark reconciled, and the statement/ledger below (no tabs). */
          <div className="overflow-y-auto flex-1">
            <AccountReconcilePanel
              account={{ id: account.id, name: account.name, currency: account.currency, initial_balance: account.initial_balance, balance: account.balance ?? null }}
              txns={txns}
              currencyById={currencyById}
              today={today}
              onReconciled={onReconciled}
            />
          </div>
        )}
      </div>
    </div>
  )
}
