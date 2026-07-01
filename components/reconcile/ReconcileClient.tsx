'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Scale, Loader2 } from 'lucide-react'
import { Avatar } from '@/components/AppShell'
import { formatCurrency, formatDate } from '@/lib/utils'
import { buildLedger, accountIsForeign, type ReconTxn } from '@/lib/reconcile'
import { createClient } from '@/lib/supabase/client'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { notify } from '@/components/shared/Toast'

export interface ReconcileAccount {
  id: string
  name: string
  type: string
  currency: string
  initial_balance: number
  balance: number | null
  avatar_url: string | null
  color: string | null
  custom_type_name: string | null
  is_active: boolean
}
export type ReconcileTxn = ReconTxn

const fmt = (n: number) => formatCurrency(n)

const FLAG_LABEL: Record<string, { text: string; color: string }> = {
  foreign:          { text: 'foreign currency', color: '#b45309' },
  future:           { text: 'future-dated',     color: '#dc2626' },
  'dup?':           { text: 'possible duplicate', color: '#9333ea' },
  'cross-currency': { text: 'cross-currency transfer', color: '#dc2626' },
}

function AccountRow({ account, txns, currencyById, today }: {
  account: ReconcileAccount
  txns: ReconcileTxn[]
  currencyById: Record<string, string>
  today: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [actual, setActual] = useState('')
  const [reconciling, setReconciling] = useState(false)

  /** Log a "Reconciliation" transaction on this account to bring the app
   *  balance in line with the actual bank balance the user typed.
   *  - App is higher (diff > 0) → the app has a phantom credit → book an
   *    expense to knock it down.
   *  - App is lower (diff < 0) → the actual bank has more than we've tracked
   *    → book an income so the app catches up. */
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

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        {open ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'var(--text-faint)' }} />
              : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-faint)' }} />}
        {account.avatar_url
          ? <Avatar url={account.avatar_url} initials={account.name.slice(0, 2).toUpperCase()} size="sm" />
          : <div className="w-7 h-7 rounded-lg shrink-0" style={{ background: (account.color ?? '#6B7280') + '22' }} />}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{account.name}</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {account.custom_type_name ?? account.type}{!account.is_active ? ' · inactive' : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold" style={{ color: viewBalance < 0 ? 'var(--expense)' : 'var(--text)' }}>{fmt(viewBalance)}</p>
          <div className="flex items-center justify-end gap-1.5 mt-0.5">
            {accountIsForeign(account.currency) && (
              <span className="text-[10px]" style={{ color: '#b45309' }}>{account.currency}</span>
            )}
            {anomalyCount > 0
              ? <span className="text-[10px] flex items-center gap-0.5" style={{ color: '#b45309' }}><AlertTriangle className="w-3 h-3" />{anomalyCount}</span>
              : <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--income)' }}><CheckCircle2 className="w-3 h-3" />clean</span>}
          </div>
        </div>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          {/* Actual-balance checker */}
          <div className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ background: 'var(--surface-2)' }}>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>What does the bank/statement actually say?</span>
            <input
              type="number"
              value={actual}
              onChange={e => setActual(e.target.value)}
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
                onClick={() => logReconciliationEntry(Math.abs(diff), diff > 0 ? 'expense' : 'income')}
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
      )}
    </div>
  )
}

export default function ReconcileClient({ accounts, txns }: { accounts: ReconcileAccount[]; txns: ReconcileTxn[] }) {
  const today = new Date().toISOString().split('T')[0]
  const currencyById = useMemo(() => {
    const m: Record<string, string> = {}
    for (const a of accounts) m[a.id] = a.currency
    return m
  }, [accounts])

  const hasForeign = accounts.some(a => accountIsForeign(a.currency))

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Scale className="w-5 h-5" style={{ color: 'var(--brand)' }} />
        <div>
          <h1 className="text-heading" style={{ color: 'var(--text)' }}>Reconcile accounts</h1>
          <p className="text-caption">Expand an account, enter the real balance, and scroll the ledger to where it diverges.</p>
        </div>
      </div>

      {hasForeign && (
        <div className="card p-3 flex items-start gap-2 text-sm" style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.3)' }}>
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#b45309' }} />
          <span style={{ color: 'var(--text)' }}>
            Some accounts aren&apos;t in INR. Balances are summed in rupees, so a non-INR account whose opening
            balance was entered in its own currency will read incorrectly — that&apos;s the most common cause of a mismatch.
          </span>
        </div>
      )}

      {accounts.map(a => (
        <AccountRow key={a.id} account={a} txns={txns} currencyById={currencyById} today={today} />
      ))}
    </div>
  )
}
