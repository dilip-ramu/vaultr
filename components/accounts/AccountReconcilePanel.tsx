'use client'

/**
 * Reconcile panel — mounted inside an expanded AccountCard.
 * Extracted from the old standalone /reconcile page so we can retire it.
 *
 * Given one account + all txns, it renders:
 *   ─ a "what does the bank actually say?" input
 *   ─ a diff read-out
 *   ─ a "Log Reconciliation" one-click transaction button
 *   ─ a running-balance ledger with anomaly flags
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, Scale } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { buildLedger, accountIsForeign, type ReconTxn } from '@/lib/reconcile'
import { createClient } from '@/lib/supabase/client'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { notify } from '@/components/shared/Toast'

const fmt = (n: number) => formatCurrency(n)

const FLAG_LABEL: Record<string, { text: string; color: string }> = {
  foreign:          { text: 'foreign currency', color: '#b45309' },
  future:           { text: 'future-dated',     color: '#dc2626' },
  'dup?':           { text: 'possible duplicate', color: '#9333ea' },
  'cross-currency': { text: 'cross-currency transfer', color: '#dc2626' },
}

export interface ReconcileAccountLite {
  id: string
  name: string
  currency: string
  initial_balance: number
  balance: number | null
}

export default function AccountReconcilePanel({
  account, txns, currencyById, today,
}: {
  account: ReconcileAccountLite
  txns: ReconTxn[]
  currencyById: Record<string, string>
  today: string
}) {
  const router = useRouter()
  const [actual, setActual] = useState('')
  const [reconciling, setReconciling] = useState(false)

  const { rows, computedBalance } = useMemo(() => buildLedger({
    accountId: account.id,
    accountCurrency: account.currency,
    initialBalance: Number(account.initial_balance) || 0,
    txns,
    today,
    accountCurrencyById: currencyById,
  }), [account, txns, currencyById, today])

  const viewBalance = account.balance ?? computedBalance
  const anomalyCount = rows.reduce((s, r) => s + (r.flags.length > 0 ? 1 : 0), 0)
  const actualNum = parseFloat(actual)
  const diff = !Number.isNaN(actualNum) ? Math.round((viewBalance - actualNum) * 100) / 100 : null

  /** Book a "Reconciliation" transaction to bring the app in line with the bank.
   *  App is higher → post an expense. App is lower → post an income. */
  async function logReconciliationEntry(diffAbs: number, direction: 'income' | 'expense') {
    if (diffAbs <= 0) return
    const label = direction === 'income'
      ? `Add income of ${fmt(diffAbs)} on ${account.name}?`
      : `Add expense of ${fmt(diffAbs)} on ${account.name}?`
    if (!await confirmDialog({
      title: 'Log a reconciliation transaction?',
      message: `${label} It'll be named "Reconciliation" and dated today.`,
      confirmLabel: 'Log it',
    })) return

    setReconciling(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { notify('Session expired', 'error'); return }
      const { error } = await supabase.from('transactions').insert({
        user_id:            user.id,
        account_id:         account.id,
        type:               direction,
        amount:             diffAbs,
        original_currency:  account.currency ?? 'INR',
        date:               today,
        name:               'Reconciliation',
        notes:              'Manual reconciliation entry to match the bank balance.',
      })
      if (error) { notify(error.message, 'error'); return }
      notify(`${direction === 'income' ? 'Income' : 'Expense'} of ${fmt(diffAbs)} logged`, 'success')
      setActual('')
      router.refresh()
    } finally {
      setReconciling(false)
    }
  }

  // The AccountCard wraps its main body in a Link. Everything in this panel is
  // interactive — stop clicks from bubbling up to that Link and navigating away.
  const swallow = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation()

  return (
    <div
      onClick={swallow}
      onMouseDown={swallow}
      className="border-t"
      style={{ borderColor: 'var(--border)' }}
    >
      {/* Actual-balance checker */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ background: 'var(--surface-2)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          What does the bank/statement actually say?
        </span>
        <input
          type="number"
          value={actual}
          onChange={e => setActual(e.target.value)}
          onClick={swallow}
          placeholder="Real balance"
          className="px-2 py-1 rounded-lg text-sm w-32"
          style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
        />
        {diff !== null && (
          <span className="text-sm font-medium" style={{ color: Math.abs(diff) < 0.01 ? 'var(--income)' : 'var(--expense)' }}>
            {Math.abs(diff) < 0.01 ? '✓ matches' : `off by ${fmt(Math.abs(diff))} (app is ${diff > 0 ? 'higher' : 'lower'})`}
          </span>
        )}
        {diff !== null && Math.abs(diff) >= 0.01 && (
          <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); logReconciliationEntry(Math.abs(diff), diff > 0 ? 'expense' : 'income') }}
            disabled={reconciling}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold disabled:opacity-50"
            style={{ background: 'var(--brand)', color: '#fff' }}
            title={diff > 0
              ? `App shows more than bank — log an expense of ${fmt(Math.abs(diff))} named "Reconciliation" to match.`
              : `Bank shows more than app — log an income of ${fmt(Math.abs(diff))} named "Reconciliation" to match.`}
          >
            {reconciling
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Scale className="w-3.5 h-3.5" />
            }
            Log Reconciliation ({diff > 0 ? '−' : '+'}{fmt(Math.abs(diff))})
          </button>
        )}
        {accountIsForeign(account.currency) && (
          <span className="text-[10px] flex items-center gap-1" style={{ color: '#b45309' }}>
            <AlertTriangle className="w-3 h-3" /> {account.currency} account — computed balance is in INR
          </span>
        )}
        {anomalyCount > 0 && (
          <span className="text-[10px] flex items-center gap-1" style={{ color: '#b45309' }}>
            <AlertTriangle className="w-3 h-3" /> {anomalyCount} flagged row{anomalyCount === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Running-balance ledger */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[600px]">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="text-left  px-4 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Date</th>
              <th className="text-left  px-4 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Description</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Effect</th>
              <th className="text-right px-4 py-2 font-medium" style={{ color: 'var(--text-muted)' }}>Running</th>
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderBottom: '1px solid var(--border-2)' }}>
              <td className="px-4 py-2" style={{ color: 'var(--text-muted)' }}>—</td>
              <td className="px-4 py-2 italic" style={{ color: 'var(--text-muted)' }}>Opening balance</td>
              <td className="px-4 py-2 text-right" style={{ color: 'var(--text-faint)' }}>—</td>
              <td className="px-4 py-2 text-right font-medium" style={{ color: 'var(--text)' }}>{fmt(Number(account.initial_balance) || 0)}</td>
            </tr>
            {rows.map(r => (
              <tr key={r.txn.id} style={{ borderBottom: '1px solid var(--border-2)', background: r.flags.length ? 'rgba(245,158,11,0.06)' : undefined }}>
                <td className="px-4 py-2 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{formatDate(r.txn.date)}</td>
                <td className="px-4 py-2" style={{ color: 'var(--text)' }}>
                  {r.txn.name ?? <span className="capitalize">{r.txn.type}</span>}
                  {r.flags.map(f => (
                    <span key={f} className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.15)', color: FLAG_LABEL[f]?.color ?? '#b45309' }}>
                      {FLAG_LABEL[f]?.text ?? f}
                    </span>
                  ))}
                </td>
                <td className="px-4 py-2 text-right" style={{ color: r.effect >= 0 ? 'var(--income)' : 'var(--expense)' }}>
                  {r.effect >= 0 ? '+' : '−'}{fmt(Math.abs(r.effect))}
                </td>
                <td className="px-4 py-2 text-right font-medium" style={{ color: 'var(--text)' }}>{fmt(r.running)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center" style={{ color: 'var(--text-faint)' }}>No transactions.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
