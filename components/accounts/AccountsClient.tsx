'use client'

import { useState, useMemo, useCallback } from 'react'
import { useBalanceVisibility } from '@/components/shared/BalanceVisibility'
import dynamic from 'next/dynamic'
import { Plus, Wallet, CreditCard, Eye, EyeOff, Pencil, Check, Paperclip } from 'lucide-react'
import type { Account, BuiltinTypeOverride, DebitCard, AccountHolder } from '@/lib/types'
import { ACCOUNT_TYPE_CONFIG, resolveAccountTypeDisplay, getCategoryEmoji } from '@/lib/types'
import { accountGroupRank } from '@/lib/utils'
import { creditSummary, isLiability } from '@/lib/account-metrics'
import type { ReconTxn } from '@/lib/reconcile'
import type { CardTxn } from '@/lib/cards'
import type { StatementRow } from '../cards/CardsClient'
import type { PickerAccount } from '../shared/AccountChipPicker'
import { Avatar } from '../AppShell'
import CardGlass from '../shared/CardGlass'
import { cardFaceGradient } from '@/lib/card-gradient'
import AccountDetailModal from './AccountDetailModal'
const ShareCardModal = dynamic(() => import('./ShareCardModal'), { ssr: false })

const AccountForm = dynamic(() => import('./AccountForm'), { ssr: false })

interface Props {
  initialAccounts: Account[]
  builtinOverrides?: BuiltinTypeOverride[]
  debitCards?: DebitCard[]
  holders?: AccountHolder[]
  reconcileTxns?: ReconTxn[]
  cardTxns?: CardTxn[]
  cardStatements?: StatementRow[]
  payAccounts?: PickerAccount[]
}

// Mask a number to its last 4 digits (grouped) for the card face
function maskNumber(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\s+/g, '')
  if (!digits) return ''
  const last4 = digits.slice(-4)
  return `•••• •••• •••• ${last4}`
}
function groupNumber(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\s+/g, '')
  return digits.replace(/(.{4})/g, '$1 ').trim()
}
function expiryStr(m: number | null, y: number | null): string {
  if (!m || !y) return ''
  return `${String(m).padStart(2, '0')}/${String(y).slice(-2)}`
}

export default function AccountsClient({ initialAccounts, builtinOverrides = [], debitCards = [], holders = [], reconcileTxns, cardTxns = [], cardStatements = [], payAccounts = [] }: Props) {
  const holderById = useMemo(() => { const m: Record<string, AccountHolder> = {}; for (const h of holders) m[h.id] = h; return m }, [holders])
  const holderPhoto = useCallback((a: Account) => (a.account_holder_id ? holderById[a.account_holder_id]?.photo_url : null) || a.avatar_url || null, [holderById])
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  const [showForm, setShowForm] = useState(false)
  const [editAccount, setEditAccount] = useState<Account | null>(null)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [detailAccount, setDetailAccount] = useState<Account | null>(null)
  const [shareAccount, setShareAccount] = useState<Account | null>(null)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const toggleReveal = useCallback((key: string) => {
    setRevealed(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  }, [])

  // App-wide hide-balances state (toggle lives in the sidebar).
  const { money } = useBalanceVisibility()
  const debitByAccount = useMemo(() => {
    const m: Record<string, DebitCard[]> = {}
    for (const d of debitCards) { (m[d.account_id] ??= []).push(d) }
    return m
  }, [debitCards])

  const totalAssets = accounts
    .filter(a => !isLiability(a.type) && a.include_in_net_worth)
    .reduce((sum, a) => sum + (a.balance ?? 0), 0)

  const totalLiabilities = accounts
    .filter(a => isLiability(a.type) && a.include_in_net_worth)
    .reduce((sum, a) => sum + Math.abs(a.balance ?? 0), 0)

  const netWorth = totalAssets - totalLiabilities
  const credit = creditSummary(accounts)

  // Reconcile pre-work: today (stable per render) + accountId → currency map.
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const currencyById = useMemo(() => {
    const m: Record<string, string> = {}
    for (const a of accounts) m[a.id] = a.currency
    return m
  }, [accounts])

  const handleSaved = useCallback((account: Account) => {
    setAccounts(prev => {
      const exists = prev.find(a => a.id === account.id)
      if (exists) return prev.map(a => a.id === account.id ? account : a)
      return [...prev, account]
    })
    setShowForm(false)
    setEditAccount(null)
  }, [])

  const handleDelete = useCallback((id: string) => {
    setAccounts(prev => prev.filter(a => a.id !== id))
  }, [])

  const handleEdit = useCallback((account: Account) => {
    setEditAccount(account)
    setShowForm(true)
  }, [])

  /** Instant local update after a successful reconcile stamp — patches the
   *  matching account's last_reconciled_* fields so the badge re-renders
   *  green ("✓ Reconciled today") without waiting for router.refresh(). */
  const handleReconciled = useCallback((accountId: string, atIso: string, balance: number) => {
    setAccounts(prev => prev.map(a =>
      a.id === accountId
        ? { ...a, last_reconciled_at: atIso, last_reconciled_balance: balance }
        : a
    ))
  }, [])

  // Group accounts, then order: Current → Savings → Credit → rest
  const accountGroups = useMemo(() => {
    const groups: { key: string; label: string; color: string; type?: string; accounts: Account[] }[] = []

    // Built-in types (exclude accounts with custom_type_id from 'other' built-in group)
    for (const [type] of Object.entries(ACCOUNT_TYPE_CONFIG)) {
      const typeAccounts = accounts.filter(a => a.type === type && !a.custom_type_id)
      if (typeAccounts.length === 0) continue
      const display = resolveAccountTypeDisplay(type as keyof typeof ACCOUNT_TYPE_CONFIG, builtinOverrides)
      groups.push({ key: type, label: display.label, color: display.color, type, accounts: typeAccounts })
    }

    // Custom types
    const customTypeMap = new Map<string, { name: string; color: string; accounts: Account[] }>()
    for (const a of accounts.filter(a => a.custom_type_id)) {
      const key = a.custom_type_id!
      if (!customTypeMap.has(key)) {
        customTypeMap.set(key, { name: a.custom_type_name ?? 'Custom', color: a.custom_type_color ?? '#6B7280', accounts: [] })
      }
      customTypeMap.get(key)!.accounts.push(a)
    }
    customTypeMap.forEach((v, k) => {
      groups.push({ key: k, label: v.name, color: v.color, accounts: v.accounts })
    })

    return groups.sort((a, b) => {
      const ra = accountGroupRank(a.type, a.label)
      const rb = accountGroupRank(b.type, b.label)
      if (ra !== rb) return ra - rb
      return a.label.localeCompare(b.label)
    })
  }, [accounts, builtinOverrides])

  return (
    <div className="w-full px-4 md:px-8 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Accounts</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{accounts.length} account{accounts.length !== 1 ? 's' : ''} across {accountGroups.length} type{accountGroups.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={() => { setEditAccount(null); setShowForm(true) }}
          className="flex items-center gap-1.5 text-white text-sm font-bold px-4 py-2 rounded-xl transition-all shrink-0"
          style={{ background: 'var(--brand)', boxShadow: 'var(--shadow)' }}
        >
          <Plus className="w-4 h-4" />
          Add account
        </button>
      </div>

      {/* Net Worth band */}
      <div className="rounded-2xl px-6 py-5 md:py-6 mb-6 flex flex-col md:flex-row md:items-center gap-5 md:gap-0" style={{ background: 'linear-gradient(135deg, var(--brand-deep) 0%, var(--brand-dark) 100%)', boxShadow: 'var(--shadow-lg)' }}>
        <div className="md:flex-[1.1]">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'rgba(255,255,255,0.6)' }}>Net Worth</p>
          <p className="text-4xl font-extrabold tracking-tight leading-none mt-1.5" style={{ color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>{money(netWorth)}</p>
        </div>
        <div className="hidden md:block w-px h-14 mx-6" style={{ background: 'rgba(255,255,255,0.15)' }} />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 md:flex-[2] md:gap-6">
          <div className="flex items-baseline justify-between gap-2 sm:block">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: 'rgba(255,255,255,0.55)' }}>Assets</p>
            <p className="text-lg sm:text-xl md:text-[22px] font-extrabold tracking-tight sm:mt-0.5" style={{ color: '#FFFFFF', fontVariantNumeric: 'tabular-nums' }}>{money(totalAssets)}</p>
          </div>
          <div className="flex items-baseline justify-between gap-2 sm:block">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: 'rgba(255,255,255,0.55)' }}>Liabilities</p>
            <p className="text-lg sm:text-xl md:text-[22px] font-extrabold tracking-tight sm:mt-0.5" style={{ color: '#FCA5A5', fontVariantNumeric: 'tabular-nums' }}>{money(totalLiabilities)}</p>
          </div>
          {credit.totalLimit > 0 && (
            <div className="flex items-baseline justify-between gap-2 sm:block">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.1em]" style={{ color: 'rgba(255,255,255,0.55)' }}>Available credit</p>
              <p className="text-lg sm:text-xl md:text-[22px] font-extrabold tracking-tight sm:mt-0.5" style={{ color: '#9DE8B8', fontVariantNumeric: 'tabular-nums' }}>{money(credit.totalAvailable)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Type filter */}
      {accounts.length > 0 && accountGroups.length > 1 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <button onClick={() => setTypeFilter('all')} className="px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border transition-colors" style={typeFilter === 'all' ? { background: 'var(--brand)', borderColor: 'transparent', color: '#fff' } : { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>All</button>
          {accountGroups.map(g => (
            <button key={g.key} onClick={() => setTypeFilter(g.key)} className="px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap border flex items-center gap-1.5 transition-colors" style={typeFilter === g.key ? { background: g.color, borderColor: 'transparent', color: '#fff' } : { background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
              <span className="w-2 h-2 rounded-full" style={{ background: typeFilter === g.key ? '#fff' : g.color }} /> {g.label}
            </button>
          ))}
        </div>
      )}

      {/* Card faces */}
      {accounts.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: 'var(--surface-2)' }}>
            <Wallet className="w-7 h-7" style={{ color: 'var(--text-faint)' }} />
          </div>
          <p className="font-medium" style={{ color: 'var(--text-muted)' }}>No accounts yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-faint)' }}>Add your first account to get started</p>
          <button onClick={() => setShowForm(true)} className="mt-4 text-sm font-medium" style={{ color: 'var(--brand)' }}>+ Add Account</button>
        </div>
      ) : (
        <div className="space-y-7">
          {(typeFilter === 'all' ? accountGroups : accountGroups.filter(g => g.key === typeFilter)).map(group => (
            <div key={group.key}>
              <div className="flex items-center gap-2 mb-3 px-0.5">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: group.color }} />
                <h2 className="text-sm font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>{group.label}</h2>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>· {group.accounts.length}</span>
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {group.accounts.map(account => {
            // Card face follows the account TYPE's colour (built-in overrides and
            // custom-type colours included), so changing a type's colour updates
            // every card in that group.
            const face = group.color
            const disp = resolveAccountTypeDisplay(account.type, builtinOverrides)
            const isCredit = account.type === 'credit'
            const liability = isLiability(account.type)
            const bal = account.balance ?? 0
            const num = account.account_number
            const expKey = `exp:${account.id}`
            const expShown = revealed.has(expKey)
            const dcs = debitByAccount[account.id] ?? []
            const util = isCredit && account.credit_limit ? Math.min(Math.abs(bal) / Number(account.credit_limit), 1) : null
            const exp = expiryStr(account.card_expiry_month, account.card_expiry_year)
            return (
              <div key={account.id} onClick={() => setDetailAccount(account)} className="rounded-2xl overflow-hidden flex flex-col sm:flex-row cursor-pointer transition-shadow hover:brightness-[0.99]" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
                {/* LEFT — colored identity face */}
                <div className="sm:w-[280px] shrink-0 p-5 flex flex-col justify-between gap-5 relative overflow-hidden" style={{ background: cardFaceGradient(face), minHeight: '192px' }}>
                  <CardGlass base={face} />
                  <div className="flex items-start justify-between relative z-[1]">
                    {holderPhoto(account)
                      ? <div className="rounded-full" style={{ boxShadow: '0 0 0 2px rgba(255,255,255,0.4)' }}><Avatar url={holderPhoto(account)} initials={(account.account_holder || account.name).slice(0, 2).toUpperCase()} size="lg" /></div>
                      : (isCredit ? <CreditCard className="w-9 h-9" style={{ color: 'rgba(255,255,255,0.9)' }} /> : <Wallet className="w-9 h-9" style={{ color: 'rgba(255,255,255,0.9)' }} />)}
                    <span className="text-[10.5px] font-bold tracking-[0.1em] uppercase mt-1" style={{ color: 'rgba(255,255,255,0.8)' }}>{account.card_network || (account.custom_type_id ? group.label : disp.label)}</span>
                  </div>
                  <div className="relative z-[1]">
                    <p className="text-[8.5px] font-semibold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.5)' }}>{isCredit ? 'Card number' : 'Account number'}</p>
                    <p className="text-[15px] font-semibold tracking-[0.12em] mt-0.5" style={{ color: 'rgba(255,255,255,0.95)', fontVariantNumeric: 'tabular-nums' }}>{num ? groupNumber(num) : '—'}</p>
                    <div className="flex items-end justify-between gap-3 mt-3">
                      <div className="min-w-0">
                        <p className="text-[8.5px] font-semibold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.5)' }}>{isCredit ? 'Card holder' : 'Account holder'}</p>
                        <p className="text-[12px] font-bold truncate" style={{ color: '#fff' }}>{account.account_holder || account.name}</p>
                      </div>
                      {isCredit ? (exp && (
                        <div className="text-right shrink-0">
                          <p className="text-[8.5px] font-semibold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.5)' }}>Expiry</p>
                          <div className="flex items-center gap-1 justify-end">
                            <p className="text-[12px] font-bold" style={{ color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{expShown ? exp : '••/••'}</p>
                            <button onClick={e => { e.stopPropagation(); toggleReveal(expKey) }} aria-label="Reveal expiry">{expShown ? <EyeOff className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.7)' }} /> : <Eye className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.7)' }} />}</button>
                          </div>
                        </div>
                      )) : (account.ifsc_code && (
                        <div className="text-right shrink-0"><p className="text-[8.5px] font-semibold uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.5)' }}>IFSC</p><p className="text-[12px] font-bold" style={{ color: '#fff' }}>{account.ifsc_code}</p></div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* RIGHT — balance, status, debit cards */}
                <div className="flex-1 p-5 flex flex-col min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {account.bank_logo_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={account.bank_logo_url} alt="" className="w-9 h-9 rounded-lg object-contain shrink-0 p-0.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }} />
                      )}
                      <p className="text-[15px] font-bold truncate" style={{ color: 'var(--text)' }}>{account.name}</p>
                    </div>
                    <button onClick={e => { e.stopPropagation(); setShareAccount(account) }} className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }} title="Share bank details"><Paperclip className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="mt-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{liability ? 'Outstanding' : 'Balance'}</p>
                    <p className="text-2xl font-extrabold tracking-tight" style={{ color: liability ? 'var(--expense)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{money(Math.abs(bal))}</p>
                    {util != null && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-[10.5px] mb-1" style={{ color: 'var(--text-muted)' }}><span>Utilisation {Math.round(util * 100)}%</span><span>Limit {money(Number(account.credit_limit))}</span></div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-2)' }}><div className="h-full rounded-full" style={{ width: `${util * 100}%`, background: util >= 0.9 ? 'var(--expense)' : 'var(--income)' }} /></div>
                      </div>
                    )}
                    {isCredit && account.statement_day && <p className="text-[11px] mt-2" style={{ color: 'var(--text-faint)' }}>Statement closes on the {account.statement_day}{account.statement_due_day ? ` · due on the ${account.statement_due_day}` : ''}</p>}
                  </div>
                  {dcs.length > 0 && (
                    <div className="mt-4 pt-3 space-y-2" style={{ borderTop: '1px solid var(--border-2)' }}>
                      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>Debit card{dcs.length > 1 ? 's' : ''}</p>
                      {dcs.map(dc => {
                        const dcKey = `dc:${dc.id}`, dcShown = revealed.has(dcKey)
                        return (
                          <div key={dc.id} className="flex items-center gap-2 text-[12px]">
                            <CreditCard className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-faint)' }} />
                            <span className="font-semibold truncate" style={{ color: 'var(--text)' }}>{dc.label || dc.card_network || 'Debit'}</span>
                            <span className="tabular-nums" style={{ color: 'var(--text-muted)' }}>{dc.card_number ? (dcShown ? groupNumber(dc.card_number) : `•• ${dc.card_number.replace(/\s+/g, '').slice(-4)}`) : ''}</span>
                            {dc.expiry_month && dc.expiry_year && <span className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>{expiryStr(dc.expiry_month, dc.expiry_year)}</span>}
                            {dc.card_number && <button onClick={e => { e.stopPropagation(); toggleReveal(dcKey) }} className="ml-auto shrink-0" aria-label="Reveal">{dcShown ? <EyeOff className="w-3.5 h-3.5" style={{ color: 'var(--text-faint)' }} /> : <Eye className="w-3.5 h-3.5" style={{ color: 'var(--text-faint)' }} />}</button>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {account.last_reconciled_at && (
                    <div className="mt-auto pt-3 flex justify-end">
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold" style={{ color: 'var(--income)' }}>
                        <Check className="w-3 h-3" /> Reconciled {new Date(account.last_reconciled_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
              </div>
            </div>
          ))}
        </div>
      )}

      {detailAccount && (
        <AccountDetailModal
          account={detailAccount}
          accent={accountGroups.find(g => g.accounts.some(a => a.id === detailAccount.id))?.color}
          txns={reconcileTxns ?? []}
          currencyById={currencyById}
          today={today}
          onReconciled={handleReconciled}
          cardTxns={cardTxns}
          cardStatements={cardStatements}
          payAccounts={payAccounts}
          onEdit={a => { setDetailAccount(null); handleEdit(a) }}
          onDeleted={handleDelete}
          onClose={() => setDetailAccount(null)}
        />
      )}

      {shareAccount && (
        <ShareCardModal
          account={shareAccount}
          accent={accountGroups.find(g => g.accounts.some(a => a.id === shareAccount.id))?.color ?? '#334155'}
          typeLabel={accountGroups.find(g => g.accounts.some(a => a.id === shareAccount.id))?.label ?? shareAccount.type}
          photoUrl={holderPhoto(shareAccount)}
          debitCards={debitByAccount[shareAccount.id] ?? []}
          onClose={() => setShareAccount(null)}
        />
      )}

      {showForm && (
        <AccountForm
          account={editAccount}
          holders={holders}
          onSaved={handleSaved}
          onClose={() => { setShowForm(false); setEditAccount(null) }}
          onDeleted={handleDelete}
        />
      )}
    </div>
  )
}
