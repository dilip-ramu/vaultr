'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Pencil, Copy, Check, Calendar, CreditCard, Upload } from 'lucide-react'
import type { Account, Transaction, BuiltinTypeOverride } from '@/lib/types'
import { ACCOUNT_TYPE_CONFIG, resolveAccountTypeDisplay, EMOJI_MAP } from '@/lib/types'
import { formatCurrency, formatDate, getRelativeDate } from '@/lib/utils'
import { Avatar } from '../AppShell'
import AccountForm from './AccountForm'
import ImportStatementModal from './ImportStatementModal'
import TransactionItem from '../transactions/TransactionItem'
import Link from 'next/link'
import { isCredit, isLoan, creditMetrics, loanMetrics } from '@/lib/account-metrics'
import { effectOn, type ReconTxn } from '@/lib/reconcile'

export interface StatementTxn {
  id: string
  type: 'income' | 'expense' | 'transfer'
  amount: number
  date: string
  name: string | null
  account_id: string
  to_account_id: string | null
  category_name: string | null
  payee_name: string | null
}

interface Props {
  account: Account
  recentTransactions: Transaction[]
  statementTxns?: StatementTxn[]
  builtinOverrides?: BuiltinTypeOverride[]
}

const DELETED_KEY = 'inex-deleted-tx-ids'
function getDeletedIds(): string[] {
  try { return JSON.parse(sessionStorage.getItem(DELETED_KEY) || '[]') } catch { return [] }
}
function addDeletedId(id: string) {
  try {
    const ids = getDeletedIds()
    if (!ids.includes(id)) sessionStorage.setItem(DELETED_KEY, JSON.stringify([...ids, id]))
  } catch {}
}

export default function AccountDetailClient({ account: initialAccount, recentTransactions, statementTxns = [], builtinOverrides = [] }: Props) {
  const router = useRouter()
  const [account, setAccount] = useState(initialAccount)
  const [showEdit, setShowEdit] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [view, setView] = useState<'statement' | 'list'>('statement')
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [transactions, setTransactions] = useState(() => {
    const deleted = getDeletedIds()
    return deleted.length ? recentTransactions.filter(t => !deleted.includes(t.id)) : recentTransactions
  })

  useEffect(() => {
    const deleted = getDeletedIds()
    setTransactions(deleted.length ? recentTransactions.filter(t => !deleted.includes(t.id)) : recentTransactions)
  }, [recentTransactions])

  const builtinConfig = ACCOUNT_TYPE_CONFIG[account.type] ?? ACCOUNT_TYPE_CONFIG.other
  const typeDisplay = account.custom_type_name
    ? { label: account.custom_type_name, color: account.custom_type_color ?? '#6B7280', bgColor: `${account.custom_type_color ?? '#6B7280'}18`, icon: account.custom_type_icon ?? 'more-horizontal' }
    : resolveAccountTypeDisplay(account.type, builtinOverrides)
  const typeAvatarUrl = account.custom_type_avatar_url ?? null

  const balance = account.balance ?? account.initial_balance

  // Statement: running balance, oldest→newest, then displayed newest-first
  const statementRows = (() => {
    const sorted = [...statementTxns].sort((a, b) =>
      a.date.localeCompare(b.date) || a.id.localeCompare(b.id)
    )
    let running = Number(account.initial_balance) || 0
    const rows = sorted.map(t => {
      const effect = effectOn(t as unknown as ReconTxn, account.id)
      running = Math.round((running + effect) * 100) / 100
      return { txn: t, effect, running }
    })
    return rows.reverse()
  })()

  const copyToClipboard = (value: string, field: string) => {
    navigator.clipboard.writeText(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const handleSaved = (updated: Account) => {
    setAccount(updated)
    setShowEdit(false)
    router.refresh()
  }

  const handleDeleteTx = async (id: string) => {
    addDeletedId(id)
    setTransactions(prev => prev.filter(t => t.id !== id))
    const supabase = createClient()
    const { data } = await supabase
      .from('account_balances')
      .select('*')
      .eq('id', account.id)
      .single()
    if (data) setAccount(data)
    router.refresh()
  }

  const DetailRow = ({
    label, value, field, mono = false
  }: { label: string; value: string | null | undefined; field: string; mono?: boolean }) => {
    if (!value) return null
    return (
      <div className="flex items-center justify-between py-3 border-b border-[var(--border)] last:border-0">
        <p className="text-xs text-[var(--text-muted)]">{label}</p>
        <div className="flex items-center gap-2">
          <p className={`text-sm text-[var(--text)] ${mono ? 'font-mono' : 'font-medium'}`}>{value}</p>
          <button
            onClick={() => copyToClipboard(value, field)}
            className="text-[var(--text-faint)] hover:text-[var(--brand)] transition-colors"
          >
            {copiedField === field
              ? <Check className="w-3.5 h-3.5 text-[var(--income)]" />
              : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    )
  }

  const hasDetails = account.account_number || account.branch || account.ifsc_code ||
    account.swift_code || account.bank_address || account.open_date || account.closing_date

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-4">
      {/* Back */}
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text)] -ml-1">
        <ArrowLeft className="w-4 h-4" />
        Accounts
      </button>

      {/* Hero card */}
      <div
        className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden"
        style={{ borderTopWidth: '4px', borderTopColor: account.color || typeDisplay.color }}
      >
        <div className="p-5">
          <div className="flex items-center gap-4 mb-4">
            {account.avatar_url ? (
              <Avatar url={account.avatar_url} initials={account.name.slice(0, 2).toUpperCase()} size="lg" />
            ) : typeAvatarUrl ? (
              <img src={typeAvatarUrl} alt={typeDisplay.label} className="w-14 h-14 rounded-2xl object-cover shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                style={{ backgroundColor: typeDisplay.bgColor }}>
                {EMOJI_MAP[typeDisplay.icon] ?? getAccountEmoji(account.type)}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-[var(--text)] truncate">{account.name}</h1>
              <p className="text-sm text-[var(--text-faint)]">{typeDisplay.label} · {account.currency}</p>
              {!account.include_in_net_worth && (
                <p className="text-xs text-[var(--amber)] mt-0.5">Excluded from net worth</p>
              )}
            </div>
            <button
              onClick={() => setShowImport(true)}
              title="Import past statement"
              className="w-9 h-9 bg-[var(--surface-2)] rounded-xl flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--brand)] hover:bg-brand-50 transition-colors shrink-0"
            >
              <Upload className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowEdit(true)}
              className="w-9 h-9 bg-[var(--surface-2)] rounded-xl flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--brand)] hover:bg-brand-50 transition-colors shrink-0"
            >
              <Pencil className="w-4 h-4" />
            </button>
          </div>

          {/* Balance — type-aware */}
          {isCredit(account.type) ? (() => {
            const m = creditMetrics(account)
            return (
              <div className="bg-[var(--surface-2)] rounded-xl px-4 py-3 space-y-2">
                <div>
                  <p className="text-xs text-[var(--text-muted)] mb-0.5">Outstanding</p>
                  <p className="text-2xl font-bold" style={{ color: m.outstanding > 0 ? 'var(--expense)' : 'var(--income)' }}>
                    {m.outstanding > 0 ? formatCurrency(m.outstanding) : (m.creditBalance > 0 ? `+${formatCurrency(m.creditBalance)}` : 'No dues')}
                  </p>
                </div>
                {m.limit != null && (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span style={{ color: m.overLimit ? 'var(--expense)' : 'var(--text-muted)' }}>
                        {m.overLimit ? 'Over limit!' : `${formatCurrency(m.available ?? 0)} available`}
                      </span>
                      <span className="text-[var(--text-faint)]">of {formatCurrency(m.limit)} · {Math.round((m.utilisation ?? 0) * 100)}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div className="h-full rounded-full" style={{
                        width: `${Math.min((m.utilisation ?? 0) * 100, 100)}%`,
                        background: (m.utilisation ?? 0) >= 0.9 ? 'var(--expense)' : (m.utilisation ?? 0) >= 0.5 ? '#F59E0B' : 'var(--income)',
                      }} />
                    </div>
                  </>
                )}
                {account.interest_rate != null && <p className="text-xs text-[var(--text-faint)]">{account.interest_rate}% APR</p>}
              </div>
            )
          })() : isLoan(account.type) ? (() => {
            const m = loanMetrics(account)
            return (
              <div className="bg-[var(--surface-2)] rounded-xl px-4 py-3 space-y-2">
                <div>
                  <p className="text-xs text-[var(--text-muted)] mb-0.5">Remaining</p>
                  <p className="text-2xl font-bold" style={{ color: m.outstanding > 0 ? 'var(--expense)' : 'var(--income)' }}>{formatCurrency(m.outstanding)}</p>
                </div>
                {m.principal != null && (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span style={{ color: 'var(--income)' }}>{formatCurrency(m.repaid ?? 0)} repaid</span>
                      <span className="text-[var(--text-faint)]">of {formatCurrency(m.principal)} · {Math.round((m.progress ?? 0) * 100)}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min((m.progress ?? 0) * 100, 100)}%`, background: 'var(--income)' }} />
                    </div>
                  </>
                )}
                {(m.emi != null || m.rate != null) && (
                  <p className="text-xs text-[var(--text-faint)]">
                    {m.emi != null && `EMI ${formatCurrency(m.emi)}`}{m.emi != null && m.rate != null && ' · '}{m.rate != null && `${m.rate}%`}
                  </p>
                )}
              </div>
            )
          })() : (
            <div className="bg-[var(--surface-2)] rounded-xl px-4 py-3">
              <p className="text-xs text-[var(--text-muted)] mb-0.5">Current Balance</p>
              <p className={`text-2xl font-bold ${balance < 0 ? 'text-[var(--expense)]' : 'text-[var(--text)]'}`}>
                {formatCurrency(balance)}
              </p>
              {account.initial_balance !== 0 && (
                <p className="text-xs text-[var(--text-faint)] mt-0.5">
                  Opening: {formatCurrency(account.initial_balance)}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bank Details */}
      {hasDetails && (
        <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)] flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-[var(--text-faint)]" />
            <p className="text-sm font-semibold text-[var(--text)]">Bank Details</p>
          </div>
          <div className="px-5">
            <DetailRow label="Account Number" value={account.account_number} field="account_number" mono />
            <DetailRow label="Branch" value={account.branch} field="branch" />
            <DetailRow label="IFSC Code" value={account.ifsc_code} field="ifsc_code" mono />
            <DetailRow label="SWIFT Code" value={account.swift_code} field="swift_code" mono />
            {account.open_date && (
              <div className="flex items-center justify-between py-3 border-b border-[var(--border)]">
                <p className="text-xs text-[var(--text-muted)]">Opened</p>
                <p className="text-sm font-medium text-[var(--text)]">{formatDate(account.open_date)}</p>
              </div>
            )}
            {account.closing_date && (
              <div className="flex items-center justify-between py-3 border-b border-[var(--border)]">
                <p className="text-xs text-[var(--text-muted)]">Closing Date</p>
                <p className="text-sm font-medium text-[var(--amber)]">{formatDate(account.closing_date)}</p>
              </div>
            )}
            {account.bank_address && (
              <div className="py-3">
                <p className="text-xs text-[var(--text-muted)] mb-1">Address</p>
                <p className="text-sm text-[var(--text)]">{account.bank_address}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Transactions — Statement / List toggle */}
      <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-sm overflow-hidden" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ background: 'var(--surface-2)' }}>
            {(['statement', 'list'] as const).map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors"
                style={view === v
                  ? { background: 'var(--surface)', color: 'var(--text)', boxShadow: '0 1px 2px rgba(0,0,0,.06)' }
                  : { color: 'var(--text-muted)' }}
              >
                {v}
              </button>
            ))}
          </div>
          <Link href={`/transactions?account=${account.id}`} className="text-xs font-medium hover:underline" style={{ color: 'var(--brand)' }}>
            Open in Transactions
          </Link>
        </div>

        {view === 'statement' ? (
          statementRows.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm" style={{ color: 'var(--text-faint)' }}>No transactions yet</div>
          ) : (
            <div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th className="text-left  px-3 py-2.5 font-medium" style={{ color: 'var(--text-muted)' }}>Date</th>
                    <th className="text-left  px-3 py-2.5 font-medium" style={{ color: 'var(--text-muted)' }}>Description</th>
                    <th className="text-right px-3 py-2.5 font-medium" style={{ color: 'var(--text-muted)' }}>Amount</th>
                    <th className="text-right px-3 py-2.5 font-medium" style={{ color: 'var(--text-muted)' }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {statementRows.map(({ txn, effect, running }) => (
                    <tr key={txn.id} style={{ borderBottom: '1px solid var(--border-2)' }}>
                      <td className="px-3 py-2.5 whitespace-nowrap align-top" style={{ color: 'var(--text-muted)' }}>{formatDate(txn.date)}</td>
                      <td className="px-3 py-2.5 align-top" style={{ color: 'var(--text)' }}>
                        {txn.name || txn.payee_name || txn.category_name || (txn.type === 'transfer' ? 'Transfer' : txn.type)}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap align-top font-medium" style={{ color: effect < 0 ? 'var(--expense)' : 'var(--income)' }}>
                        {effect < 0 ? '−' : '+'}{formatCurrency(Math.abs(effect))}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap align-top font-medium" style={{ color: running < 0 ? 'var(--expense)' : 'var(--text)' }}>{formatCurrency(running)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--surface-2)' }}>
                    <td className="px-3 py-2.5 align-top" style={{ color: 'var(--text-faint)' }}>—</td>
                    <td className="px-3 py-2.5 italic align-top" style={{ color: 'var(--text-muted)' }}>Opening balance</td>
                    <td />
                    <td className="px-3 py-2.5 text-right whitespace-nowrap align-top font-medium" style={{ color: 'var(--text)' }}>{formatCurrency(Number(account.initial_balance) || 0)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        ) : (
          transactions.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-[var(--text-faint)]">No transactions yet</div>
          ) : (
            <div>
              {transactions.map((tx, i) => (
                <TransactionItem
                  key={tx.id}
                  transaction={tx}
                  isLast={i === transactions.length - 1}
                  onEdit={() => {}}
                  onDelete={handleDeleteTx}
                  contextAccountId={account.id}
                />
              ))}
              <Link href={`/transactions?account=${account.id}`} className="block px-5 py-3 text-center text-xs font-medium hover:underline" style={{ color: 'var(--brand)' }}>
                View all transactions
              </Link>
            </div>
          )
        )}
      </div>

      {showEdit && (
        <AccountForm
          account={account}
          onSaved={handleSaved}
          onClose={() => setShowEdit(false)}
        />
      )}

      {showImport && (
        <ImportStatementModal
          accountId={account.id}
          accountName={account.name}
          earliestExistingDate={
            statementTxns.length > 0
              ? [...statementTxns].sort((a, b) => a.date.localeCompare(b.date))[0].date
              : null
          }
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  )
}

function getAccountEmoji(type: string): string {
  const map: Record<string, string> = {
    checking: '🏦', savings: '🐷', credit: '💳', auto_loan: '🚗', home_loan: '🏠', business_loan: '💼', chit: '🏢',
    cash: '💵', investment: '📈', loan: '🏛️', other: '💰',
  }
  return map[type] ?? '💰'
}
