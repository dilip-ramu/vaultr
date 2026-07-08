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
import { AlertTriangle, Check, Loader2, Scale } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { buildLedger, accountIsForeign, type ReconTxn } from '@/lib/reconcile'
import { createClient } from '@/lib/supabase/client'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { notify } from '@/components/shared/Toast'

const fmt = (n: number) => formatCurrency(n)

const FLAG_LABEL: Record<string, { text: string; color: string }> = {
  foreign:          { text: 'foreign currency', color: 'var(--amber)' },
  future:           { text: 'future-dated',     color: 'var(--expense)' },
  'dup?':           { text: 'possible duplicate', color: '#9333ea' },
  'cross-currency': { text: 'cross-currency transfer', color: 'var(--expense)' },
}

export interface ReconcileAccountLite {
  id: string
  name: string
  currency: string
  initial_balance: number
  balance: number | null
}

export default function AccountReconcilePanel({
  account, txns, currencyById, today, onReconciled,
}: {
  account: ReconcileAccountLite
  txns: ReconTxn[]
  currencyById: Record<string, string>
  today: string
  /** Fires after a successful stamp so the parent list can update its local
   *  copy of the account and re-render the "✓ Reconciled today" badge without
   *  waiting for a full router.refresh() round-trip. */
  onReconciled?: (accountId: string, atIso: string, balance: number) => void
}) {
  const router = useRouter()
  const [actual, setActual] = useState('')
  const [reconciling, setReconciling] = useState(false)
  const [marking, setMarking] = useState(false)

  /** Write last_reconciled_at + last_reconciled_balance, then push the same
   *  values back up so the parent state matches — router.refresh() alone won't
   *  update the badge because AccountsClient keeps accounts in useState. */
  async function stampReconciled(balance: number) {
    const atIso = new Date().toISOString()
    const supabase = createClient()
    const { error } = await supabase
      .from('accounts')
      .update({
        last_reconciled_at:      atIso,
        last_reconciled_balance: balance,
      })
      .eq('id', account.id)
    if (error) throw error
    onReconciled?.(account.id, atIso, balance)
  }

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
      // The plug transaction makes app == bank, so we can also stamp the
      // reconciled-at marker in the same click — no second confirmation.
      try { await stampReconciled(actualNum) } catch (e) {
        // Non-fatal: the transaction landed, just the stamp didn't. Surface it
        // so the user knows to try Mark-as-reconciled from the panel if needed.
        notify('Transaction logged, but couldn’t update the reconciled date.', 'error')
      }
      notify(`${direction === 'income' ? 'Income' : 'Expense'} of ${fmt(diffAbs)} logged`, 'success')
      setActual('')
      router.refresh()
    } finally {
      setReconciling(false)
    }
  }

  /** Called when app == bank (diff < 0.01) and the user confirms the balance
   *  is actually correct. Nothing to insert — just stamp the marker. */
  async function markReconciled() {
    if (Number.isNaN(actualNum)) return
    setMarking(true)
    try {
      await stampReconciled(actualNum)
      notify(`${account.name} marked reconciled`, 'success')
      setActual('')
      router.refresh()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not mark reconciled'
      notify(msg, 'error')
    } finally {
      setMarking(false)
    }
  }

  // The AccountCard wraps its main body in a Link. Everything in this panel is
  // interactive — stop clicks from bubbling up to that Link and navigating away.
  const swallow = (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation()

  // Difference-card theming (20a): neutral until a bank balance is entered,
  // green when it matches, red when it's off.
  const matched = diff !== null && Math.abs(diff) < 0.01
  const diffHue = diff === null ? null : matched ? 'var(--income)' : 'var(--expense)'
  const diffCardStyle: React.CSSProperties = {
    flex: 1, borderRadius: '13px', padding: '14px 16px',
    background: diffHue ? `color-mix(in srgb, ${diffHue} 9%, var(--surface))` : 'var(--surface)',
    border: `1px solid ${diffHue ? `color-mix(in srgb, ${diffHue} 28%, transparent)` : 'var(--border)'}`,
  }
  const diffText = diff === null ? '—' : matched ? '₹0' : `${diff > 0 ? '−' : '+'}${fmt(Math.abs(diff))}`

  return (
    <div
      onClick={swallow}
      onMouseDown={swallow}
      className="border-t p-5"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}
    >
      {/* App vs bank vs difference (20a) */}
      <div className="flex gap-3 mb-4">
        <div className="flex-1 rounded-[13px] px-4 py-[14px]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-[10px] font-extrabold tracking-[.06em]" style={{ color: 'var(--text-muted)' }}>APP BALANCE</p>
          <p className="text-[20px] font-extrabold mt-[3px]" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{fmt(viewBalance)}</p>
        </div>
        <div className="flex-1 rounded-[13px] px-4 py-[14px]" style={{ background: 'var(--surface)', border: '1.5px solid var(--brand)' }}>
          <p className="text-[10px] font-extrabold tracking-[.06em]" style={{ color: 'var(--brand)' }}>ACTUAL BANK BALANCE</p>
          <input
            type="number" value={actual} onChange={e => setActual(e.target.value)} onClick={swallow}
            placeholder="Enter…"
            className="w-full bg-transparent outline-none text-[20px] font-extrabold mt-[3px] p-0 border-0"
            style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums', boxShadow: 'none' }}
          />
        </div>
        <div style={diffCardStyle}>
          <p className="text-[10px] font-extrabold tracking-[.06em]" style={{ color: diffHue ?? 'var(--text-muted)' }}>DIFFERENCE</p>
          <p className="text-[20px] font-extrabold mt-[3px]" style={{ color: diffHue ?? 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{diffText}</p>
        </div>
      </div>

      {/* Action row — sits above the statement so reconciling is the first thing */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 flex items-center gap-[10px] rounded-[11px] px-[14px] py-[11px]" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Actual bank balance</span>
          <span className="text-[14px] font-bold ml-auto" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{actual ? fmt(actualNum) : '—'}</span>
        </div>
        {diff !== null && Math.abs(diff) < 0.01 ? (
          <button onClick={e => { e.preventDefault(); e.stopPropagation(); markReconciled() }} disabled={marking}
            className="inline-flex items-center gap-[7px] rounded-[11px] px-[18px] py-[11px] text-[13px] font-bold text-white disabled:opacity-50 whitespace-nowrap" style={{ background: 'var(--brand)' }}>
            {marking ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Check className="w-[15px] h-[15px]" />}
            Matches — Mark reconciled
          </button>
        ) : diff !== null ? (
          <button onClick={e => { e.preventDefault(); e.stopPropagation(); logReconciliationEntry(Math.abs(diff), diff > 0 ? 'expense' : 'income') }} disabled={reconciling}
            className="inline-flex items-center gap-[7px] rounded-[11px] px-[18px] py-[11px] text-[13px] font-bold text-white disabled:opacity-50 whitespace-nowrap" style={{ background: 'var(--brand)' }}>
            {reconciling ? <Loader2 className="w-[15px] h-[15px] animate-spin" /> : <Scale className="w-[15px] h-[15px]" />}
            Log difference ({diff > 0 ? '−' : '+'}{fmt(Math.abs(diff))})
          </button>
        ) : (
          <button disabled className="rounded-[11px] px-[18px] py-[11px] text-[13px] font-bold whitespace-nowrap opacity-60" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
            Enter balance
          </button>
        )}
      </div>

      {/* Statement ledger — Date · Description · Amount · Running (newest first) */}
      <div className="rounded-[13px] overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="grid px-[15px] py-[9px] gap-2" style={{ gridTemplateColumns: '84px 1.4fr 1fr 1fr', borderBottom: '1px solid var(--border)' }}>
          <span className="text-[9.5px] font-extrabold tracking-[.06em]" style={{ color: 'var(--text-muted)' }}>DATE</span>
          <span className="text-[9.5px] font-extrabold tracking-[.06em]" style={{ color: 'var(--text-muted)' }}>DESCRIPTION</span>
          <span className="text-[9.5px] font-extrabold tracking-[.06em] text-right" style={{ color: 'var(--text-muted)' }}>AMOUNT</span>
          <span className="text-[9.5px] font-extrabold tracking-[.06em] text-right" style={{ color: 'var(--text-muted)' }}>RUNNING</span>
        </div>
        {[...rows].reverse().slice(0, 60).map((r, i, arr) => (
          <div key={r.txn.id} className="grid px-[15px] py-[9px] gap-2 items-center" style={{ gridTemplateColumns: '84px 1.4fr 1fr 1fr', borderBottom: i < arr.length - 1 ? '1px solid var(--border-2)' : 'none', background: r.flags.length ? 'color-mix(in srgb, var(--amber) 6%, transparent)' : undefined }}>
            <span className="text-[11.5px] whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{formatDate(r.txn.date)}</span>
            <span className="text-[12px] truncate pr-2" style={{ color: 'var(--text)' }}>{r.txn.name ?? <span className="capitalize">{r.txn.type}</span>}</span>
            <span className="text-[12px] text-right" style={{ color: r.effect >= 0 ? 'var(--income)' : 'var(--expense)', fontVariantNumeric: 'tabular-nums' }}>{r.effect >= 0 ? '+' : '−'}{fmt(Math.abs(r.effect))}</span>
            <span className="text-[12px] text-right" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{fmt(r.running)}</span>
          </div>
        ))}
        {rows.length === 0 && <div className="px-4 py-6 text-center text-[12px]" style={{ color: 'var(--text-faint)' }}>No transactions yet.</div>}
      </div>

      {/* Warnings */}
      {(accountIsForeign(account.currency) || anomalyCount > 0) && (
        <div className="flex flex-wrap gap-3 mt-3">
          {accountIsForeign(account.currency) && (
            <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--amber)' }}>
              <AlertTriangle className="w-3 h-3" /> {account.currency} account — computed balance is in INR
            </span>
          )}
          {anomalyCount > 0 && (
            <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--amber)' }}>
              <AlertTriangle className="w-3 h-3" /> {anomalyCount} flagged row{anomalyCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
