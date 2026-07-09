'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard, AlertTriangle, PiggyBank, X, CheckCircle2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate, getTodayString } from '@/lib/utils'
import { cardOverview, type CardTxn, type CardCycle } from '@/lib/cards'
import AccountChipPicker, { type PickerAccount } from '@/components/shared/AccountChipPicker'
import { Avatar } from '@/components/AppShell'
import CardGlass from '@/components/shared/CardGlass'
import { cardFaceGradient } from '@/lib/card-gradient'
import { confirmDialog } from '@/components/shared/ConfirmDialog'

export interface CardAccount {
  id: string
  name: string
  color: string | null
  avatar_url: string | null
  initial_balance: number
  statement_day: number | null
  statement_due_day: number | null
  credit_limit: number | null
}

export interface StatementRow {
  account_id: string
  statement_date: string
  bank_amount: number | null
  payment_transaction_id: string | null
}

interface Props {
  cards: CardAccount[]
  txns: CardTxn[]
  statements: StatementRow[]
  payAccounts: PickerAccount[]
}

const fmt = (n: number) => formatCurrency(n)

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

function DaySelect({ value, onChange, placeholder }: {
  value: number | null
  onChange: (d: number) => void
  placeholder: string
}) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(Number(e.target.value))}
      className="px-2 py-1.5 rounded-lg text-sm"
      style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}
    >
      <option value="" disabled>{placeholder}</option>
      {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
    </select>
  )
}

function HiddenChargeBadge({ value }: { value: number | null }) {
  if (value === null) return <span style={{ color: 'var(--text-faint)' }}>—</span>
  if (Math.abs(value) < 0.01) return <span style={{ color: 'var(--income)' }}>₹0 ✓</span>
  return (
    <span className="font-semibold" style={{ color: value > 0 ? 'var(--expense)' : 'var(--income)' }}>
      {value > 0 ? '+' : '−'}{fmt(Math.abs(value))}
    </span>
  )
}

export function SingleCard({ card, txns, bankAmounts, stmtRows, payAccounts, onSaved }: {
  card: CardAccount
  txns: CardTxn[]
  bankAmounts: Record<string, number>
  stmtRows: Record<string, StatementRow>
  payAccounts: PickerAccount[]
  onSaved: () => void
}) {
  const supabase = createClient()
  const [stmtDay, setStmtDay] = useState(card.statement_day)
  const [dueDay, setDueDay] = useState(card.statement_due_day)
  const [editing, setEditing] = useState<string | null>(null) // statement_date being edited
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  // Pay modal state
  const [payOpen, setPayOpen] = useState(false)
  const [payBankAmount, setPayBankAmount] = useState('')
  const [payFromId, setPayFromId] = useState('')
  const [payDate, setPayDate] = useState(getTodayString())
  const [payBusy, setPayBusy] = useState(false)
  const [payError, setPayError] = useState('')

  const today = new Date().toISOString().split('T')[0]

  const overview = useMemo(() => {
    if (!stmtDay) return null
    return cardOverview({
      accountId: card.id,
      initialBalance: Number(card.initial_balance) || 0,
      statementDay: stmtDay,
      dueDay: dueDay,
      txns,
      bankAmounts,
      today,
      historyMonths: 12,
    })
  }, [card.id, card.initial_balance, stmtDay, dueDay, txns, bankAmounts, today])

  async function saveDay(field: 'statement_day' | 'statement_due_day', value: number) {
    if (field === 'statement_day') setStmtDay(value)
    else setDueDay(value)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('accounts').update({ [field]: value }).eq('id', card.id).eq('user_id', user.id)
    onSaved()
  }

  async function saveBankAmount(statementDate: string) {
    const value = parseFloat(draft)
    if (Number.isNaN(value) || value < 0) { setEditing(null); return }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('card_statements').upsert(
      { user_id: user!.id, account_id: card.id, statement_date: statementDate, bank_amount: value },
      { onConflict: 'account_id,statement_date' },
    )
    setSaving(false)
    setEditing(null)
    onSaved()
  }

  const latest = overview?.cycles[0]
  const latestRow = latest ? stmtRows[latest.statementDate] : undefined
  const latestPaid = !!latestRow?.payment_transaction_id || (latest ? latest.remainingDue <= 0 && latest.paidSinceClose > 0 : false)

  // Derived display values for the spec card visual + stats
  const remainingDue = latest ? latest.remainingDue : 0
  const dueDateStr = latest ? new Date(latest.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''
  const daysToDue = latest ? Math.ceil((new Date(latest.dueDate).getTime() - Date.now()) / 86400000) : null
  const paidOff = remainingDue <= 0
  const urgent = !paidOff && daysToDue != null && daysToDue <= 2
  const dueColor = paidOff ? 'var(--income)' : daysToDue != null && daysToDue <= 2 ? 'var(--expense)' : daysToDue != null && daysToDue <= 5 ? 'var(--amber)' : 'var(--text-muted)'
  const dueLabel = paidOff ? 'No dues' : daysToDue == null ? '' : daysToDue < 0 ? `${-daysToDue}d overdue · ${dueDateStr}` : daysToDue === 0 ? `Due today · ${dueDateStr}` : `Due in ${daysToDue} day${daysToDue !== 1 ? 's' : ''} · ${dueDateStr}`
  const statementAmount = latest ? (latest.bankAmount ?? latest.calculatedAmount) : 0
  const outstanding = (overview ? overview.currentCycleSpend : 0) + remainingDue
  const cardLimit = card.credit_limit ? Number(card.credit_limit) : null
  const utilisation = cardLimit && cardLimit > 0 ? outstanding / cardLimit : null
  const cardColor = card.color ?? '#2A7A50'

  function openPay(cycle: CardCycle) {
    setPayBankAmount(cycle.bankAmount !== null ? String(cycle.bankAmount) : '')
    setPayFromId(payAccounts[0]?.id ?? '')
    setPayDate(getTodayString())
    setPayError('')
    setPayOpen(true)
  }

  // Pay the BANK's statement figure (never the app's calculated number).
  async function confirmPay(cycle: CardCycle) {
    const bankVal = parseFloat(payBankAmount)
    if (Number.isNaN(bankVal) || bankVal <= 0) { setPayError("Enter the amount from the bank's statement"); return }
    if (!payFromId) { setPayError('Pick the account to pay from'); return }
    const transferAmount = Math.round(Math.max(0, bankVal - cycle.paidSinceClose) * 100) / 100
    if (transferAmount <= 0) { setPayError('Nothing left to pay — already covered by payments since the statement'); return }

    setPayBusy(true)
    setPayError('')
    const { data: { user } } = await supabase.auth.getUser()

    // 1. transfer transaction: bank → card
    const { data: txn, error: txnErr } = await supabase
      .from('transactions')
      .insert({
        user_id: user!.id,
        type: 'transfer',
        account_id: payFromId,
        to_account_id: card.id,
        amount: transferAmount,
        original_currency: 'INR',
        date: payDate,
        name: `${card.name} statement payment`,
      })
      .select('id')
      .single()

    if (txnErr || !txn) { setPayError(txnErr?.message ?? 'Failed to create transaction'); setPayBusy(false); return }

    // 2. remember the bank figure + which transaction paid it
    const { error: upErr } = await supabase.from('card_statements').upsert(
      {
        user_id: user!.id, account_id: card.id, statement_date: cycle.statementDate,
        bank_amount: bankVal, payment_transaction_id: txn.id,
      },
      { onConflict: 'account_id,statement_date' },
    )
    if (upErr) {
      // roll back the transaction so we never leave a half-recorded payment
      await supabase.from('transactions').delete().eq('id', txn.id).eq('user_id', user!.id)
      setPayError(upErr.message)
      setPayBusy(false)
      return
    }

    setPayBusy(false)
    setPayOpen(false)
    onSaved()
  }

  async function markUnpaid(cycle: CardCycle) {
    const row = stmtRows[cycle.statementDate]
    if (!row?.payment_transaction_id) return
    if (!await confirmDialog({
      title: 'Mark cycle as unpaid?',
      message: 'The card-payment transaction recorded for this cycle will be deleted. This can\'t be undone.',
      confirmLabel: 'Mark unpaid',
    })) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    await supabase.from('transactions').delete().eq('id', row.payment_transaction_id).eq('user_id', user.id)
    await supabase.from('card_statements')
      .update({ payment_transaction_id: null })
      .eq('account_id', card.id)
      .eq('statement_date', cycle.statementDate)
      .eq('user_id', user.id)
    setSaving(false)
    onSaved()
  }

  return (
    <div className="rounded-2xl p-4 md:p-5 space-y-4" style={{ background: 'var(--surface)', border: `1px solid ${urgent ? 'color-mix(in srgb, var(--expense) 30%, transparent)' : 'var(--border)'}`, boxShadow: 'var(--shadow)' }}>
      {/* Card header + cycle settings */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {card.avatar_url ? (
            <Avatar url={card.avatar_url} initials={card.name.slice(0, 2).toUpperCase()} size="sm" />
          ) : (
            <CreditCard className="w-4 h-4" style={{ color: card.color ?? 'var(--brand)' }} />
          )}
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>{card.name}</h2>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>Statement closes on</span>
          <DaySelect value={stmtDay} onChange={d => saveDay('statement_day', d)} placeholder="day" />
          <span>· payment due on</span>
          <DaySelect value={dueDay} onChange={d => saveDay('statement_due_day', d)} placeholder="day" />
        </div>
      </div>

      {!stmtDay ? (
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Pick the day your statement closes (it's on every statement the bank sends) to start tracking this card.
        </p>
      ) : !overview ? null : (
        <>
          {/* Card visual + statement stats */}
          <div className="flex flex-col lg:flex-row gap-4">
            {/* gradient card face */}
            <div className="lg:w-[260px] shrink-0 rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden" style={{ background: cardFaceGradient(cardColor), minHeight: '134px' }}>
              <CardGlass base={cardColor} />
              <div className="flex items-center justify-between relative z-[1]">
                <CreditCard className="w-6 h-6" style={{ color: 'rgba(255,255,255,0.9)' }} />
                <span className="text-[11px] font-bold tracking-[0.1em]" style={{ color: 'rgba(255,255,255,0.8)' }}>CREDIT</span>
              </div>
              <div className="relative z-[1]">
                <p className="text-[15px] font-semibold tracking-[0.2em]" style={{ color: 'rgba(255,255,255,0.85)' }}>•••• ••••</p>
                <p className="text-[13px] font-bold mt-2" style={{ color: '#fff' }}>{card.name}</p>
              </div>
            </div>
            {/* stats */}
            <div className="flex-1 min-w-0">
              {dueLabel && (
                <div className="flex items-center gap-2 mb-3.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: dueColor }} />
                  <p className="text-xs font-bold" style={{ color: dueColor }}>{dueLabel}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-x-8 gap-y-3 mb-4">
                <div>
                  <p className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>Statement amount</p>
                  <p className="text-[22px] font-extrabold tracking-tight" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{fmt(statementAmount)}</p>
                </div>
                <div>
                  <p className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>Remaining due</p>
                  <p className="text-[22px] font-extrabold tracking-tight" style={{ color: remainingDue > 0 ? 'var(--expense)' : 'var(--income)', fontVariantNumeric: 'tabular-nums' }}>{fmt(remainingDue)}</p>
                </div>
                {utilisation != null && (
                  <div>
                    <p className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>Utilisation</p>
                    <p className="text-[22px] font-extrabold tracking-tight" style={{ color: utilisation >= 0.9 ? 'var(--expense)' : 'var(--income)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(utilisation * 100)}%</p>
                  </div>
                )}
                <div>
                  <p className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>Spent this cycle</p>
                  <p className="text-[22px] font-extrabold tracking-tight" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{fmt(overview.currentCycleSpend)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {latest && latest.remainingDue > 0 && (
                  <button onClick={() => openPay(latest)} className="text-white text-[12.5px] font-bold rounded-lg px-4 py-2" style={{ background: urgent ? 'var(--expense)' : 'var(--brand)' }}>Pay statement</button>
                )}
                {latest && latestPaid && latestRow?.payment_transaction_id && (
                  <button onClick={() => markUnpaid(latest)} disabled={saving} className="text-[12.5px] font-semibold rounded-lg px-3 py-2" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }} title="Deletes the transfer transaction this payment created">Paid ✓ · undo</button>
                )}
                {latest && latest.bankAmount != null && (
                  Math.abs(latest.hiddenCharges ?? 0) < 0.01
                    ? <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: 'var(--income)' }}><CheckCircle2 className="w-3.5 h-3.5" /> Bank amount matches</span>
                    : <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: 'var(--amber)' }}><AlertTriangle className="w-3.5 h-3.5" /> Hidden charge {(latest.hiddenCharges ?? 0) > 0 ? '+' : '−'}{fmt(Math.abs(latest.hiddenCharges ?? 0))}</span>
                )}
              </div>
            </div>
          </div>

          {/* Cycle history (collapsible) */}
          <details>
            <summary className="cursor-pointer text-[12px] font-bold py-1.5 select-none" style={{ color: 'var(--brand)' }}>Statement history &amp; hidden charges</summary>
            <div className="overflow-x-auto mt-2">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left py-2 pr-3 font-medium" style={{ color: 'var(--text-muted)' }}>Statement</th>
                  <th className="text-right py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Spends</th>
                  <th className="text-right py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>App says you owed</th>
                  <th className="text-right py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Bank said</th>
                  <th className="text-right py-2 px-3 font-medium" style={{ color: 'var(--text-muted)' }}>Hidden charges</th>
                  <th className="text-right py-2 pl-3 font-medium" style={{ color: 'var(--text-muted)' }}>Due</th>
                </tr>
              </thead>
              <tbody>
                {overview.cycles.map(c => (
                  <tr key={c.statementDate} style={{ borderBottom: '1px solid var(--border-2)' }}>
                    <td className="py-2 pr-3 whitespace-nowrap" style={{ color: 'var(--text)' }}>
                      {formatDate(c.statementDate)}
                    </td>
                    <td className="py-2 px-3 text-right" style={{ color: 'var(--text-muted)' }}>{fmt(c.spends)}</td>
                    <td className="py-2 px-3 text-right font-medium" style={{ color: 'var(--text)' }}>{fmt(c.calculatedAmount)}</td>
                    <td className="py-2 px-3 text-right">
                      {editing === c.statementDate ? (
                        <span className="inline-flex items-center gap-1">
                          <input
                            autoFocus
                            type="number"
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveBankAmount(c.statementDate); if (e.key === 'Escape') setEditing(null) }}
                            className="w-28 px-2 py-1 rounded-lg text-sm text-right"
                            style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                          />
                          <button
                            onClick={() => saveBankAmount(c.statementDate)}
                            disabled={saving}
                            className="text-xs font-semibold px-2 py-1 rounded-lg"
                            style={{ background: 'var(--brand)', color: '#fff' }}
                          >
                            {saving ? '…' : 'Save'}
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => { setEditing(c.statementDate); setDraft(c.bankAmount !== null ? String(c.bankAmount) : '') }}
                          className="underline decoration-dotted underline-offset-2"
                          style={{ color: c.bankAmount !== null ? 'var(--text)' : 'var(--brand)' }}
                          title="Enter the amount from the bank's statement"
                        >
                          {c.bankAmount !== null ? fmt(c.bankAmount) : 'enter'}
                        </button>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right"><HiddenChargeBadge value={c.hiddenCharges} /></td>
                    <td className="py-2 pl-3 text-right whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                      {formatDate(c.dueDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-caption mt-2">
            "Bank said" — type in the closing balance from the bank's statement SMS/PDF. The difference is interest,
            fees and GST the bank added that your transactions don't show.
          </p>
          </details>

          {/* Pay modal */}
          {payOpen && latest && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
              <div className="rounded-[20px] w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
                <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="flex items-center gap-[9px]">
                    <div className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center" style={{ background: 'var(--brand-light)', color: 'var(--brand)' }}>
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <h3 className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>Pay {card.name}</h3>
                  </div>
                  <button onClick={() => setPayOpen(false)} className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}><X className="w-[15px] h-[15px]" /></button>
                </div>

                <div className="px-5 py-5 space-y-4 overflow-y-auto flex-1">
                  {/* Statement-due hero */}
                  <div className="rounded-[14px] p-4" style={{ background: 'linear-gradient(135deg, var(--brand-deep), color-mix(in srgb, var(--brand-deep) 76%, #000))' }}>
                    <p className="text-[10px] font-bold tracking-[0.1em]" style={{ color: 'rgba(255,255,255,.6)' }}>STATEMENT DUE</p>
                    <p className="text-[26px] font-extrabold text-white mt-[3px]" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(statementAmount || latest.calculatedAmount)}</p>
                  </div>
                  {payError && (
                    <div className="text-sm px-4 py-2 rounded-lg" style={{ background: 'color-mix(in srgb, var(--expense) 8%, transparent)', color: 'var(--expense)' }}>
                      {payError}
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                      Bank statement amount * <span style={{ color: 'var(--text-faint)' }}>(from the bank's SMS/PDF — this is what gets transferred)</span>
                    </label>
                    <input
                      type="number"
                      value={payBankAmount}
                      onChange={e => setPayBankAmount(e.target.value)}
                      placeholder={`App calculates ${fmt(latest.calculatedAmount)}`}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                    />
                    {latest.paidSinceClose > 0 && (
                      <p className="text-caption mt-1">Already paid since the statement: {fmt(latest.paidSinceClose)} — only the remainder will be transferred.</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Pay from *</label>
                    <AccountChipPicker accounts={payAccounts} selectedId={payFromId} onSelect={setPayFromId} />
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Payment date</label>
                    <input
                      type="date"
                      value={payDate}
                      onChange={e => setPayDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                    />
                  </div>

                  <p className="text-caption">
                    Creates a transfer transaction from the selected account to {card.name}. "Paid ✓ · undo" deletes it again.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-3 px-6 py-4 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
                  <button onClick={() => setPayOpen(false)} className="px-4 py-2 text-sm" style={{ color: 'var(--text-muted)' }}>Cancel</button>
                  <button
                    onClick={() => confirmPay(latest)}
                    disabled={payBusy}
                    className="px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                    style={{ background: 'var(--brand)', color: '#fff' }}
                  >
                    {payBusy ? 'Paying…' : 'Confirm Payment'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function CardsClient({ cards, txns, statements, payAccounts }: Props) {
  const router = useRouter()

  const rowsByCard = useMemo(() => {
    const map: Record<string, Record<string, StatementRow>> = {}
    for (const s of statements) {
      if (!map[s.account_id]) map[s.account_id] = {}
      map[s.account_id][s.statement_date] = s
    }
    return map
  }, [statements])

  const txnsByCard = useMemo(() => {
    const map: Record<string, CardTxn[]> = {}
    for (const c of cards) map[c.id] = []
    for (const t of txns) {
      if (map[t.account_id]) map[t.account_id].push(t)
      if (t.to_account_id && map[t.to_account_id] && t.to_account_id !== t.account_id) map[t.to_account_id].push(t)
    }
    return map
  }, [cards, txns])

  const bankByCard = useMemo(() => {
    const map: Record<string, Record<string, number>> = {}
    for (const s of statements) {
      if (s.bank_amount === null) continue
      if (!map[s.account_id]) map[s.account_id] = {}
      map[s.account_id][s.statement_date] = Number(s.bank_amount)
    }
    return map
  }, [statements])

  // Grand total of hidden charges across all configured cards
  const grandTotal = useMemo(() => {
    let total = 0
    const today = new Date().toISOString().split('T')[0]
    for (const c of cards) {
      if (!c.statement_day) continue
      const o = cardOverview({
        accountId: c.id, initialBalance: Number(c.initial_balance) || 0,
        statementDay: c.statement_day, dueDay: c.statement_due_day,
        txns: txnsByCard[c.id] ?? [], bankAmounts: bankByCard[c.id] ?? {}, today,
      })
      total += o.totalHiddenCharges
    }
    return Math.round(total * 100) / 100
  }, [cards, txnsByCard, bankByCard])

  // Portfolio summary for the spec's 3 tiles
  const summary = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const weekAhead = new Date(); weekAhead.setDate(weekAhead.getDate() + 7)
    const weekStr = weekAhead.toISOString().split('T')[0]
    let outstanding = 0, available = 0, hasLimit = false, dueAmt = 0, dueCount = 0
    for (const c of cards) {
      if (!c.statement_day) continue
      const o = cardOverview({
        accountId: c.id, initialBalance: Number(c.initial_balance) || 0,
        statementDay: c.statement_day, dueDay: c.statement_due_day,
        txns: txnsByCard[c.id] ?? [], bankAmounts: bankByCard[c.id] ?? {}, today,
      })
      const latest = o.cycles[0]
      const owed = (latest ? latest.remainingDue : 0) + o.currentCycleSpend
      outstanding += owed
      if (c.credit_limit && c.credit_limit > 0) { hasLimit = true; available += Math.max(0, Number(c.credit_limit) - owed) }
      if (latest && latest.remainingDue > 0 && latest.dueDate >= today && latest.dueDate <= weekStr) { dueAmt += latest.remainingDue; dueCount++ }
    }
    return { outstanding, available, hasLimit, dueAmt, dueCount }
  }, [cards, txnsByCard, bankByCard])

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Cards</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{cards.length} card{cards.length !== 1 ? 's' : ''}{summary.outstanding > 0 ? ` · ${fmt(summary.outstanding)} outstanding` : ''}</p>
        </div>
        {grandTotal > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
               style={{ background: 'color-mix(in srgb, var(--expense) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--expense) 20%, transparent)' }}>
            <AlertTriangle className="w-4 h-4" style={{ color: 'var(--expense)' }} />
            <span style={{ color: 'var(--text)' }}>
              Hidden charges last 12 months: <strong style={{ color: 'var(--expense)' }}>{fmt(grandTotal)}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Summary tiles */}
      {cards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
            <p className="text-[10px] font-bold tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>TOTAL OUTSTANDING</p>
            <p className="text-[22px] font-extrabold tracking-tight mt-1" style={{ color: 'var(--expense)', fontVariantNumeric: 'tabular-nums' }}>{fmt(summary.outstanding)}</p>
          </div>
          <div className="rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
            <p className="text-[10px] font-bold tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>AVAILABLE CREDIT</p>
            <p className="text-[22px] font-extrabold tracking-tight mt-1" style={{ color: 'var(--income)', fontVariantNumeric: 'tabular-nums' }}>{summary.hasLimit ? fmt(summary.available) : '—'}</p>
          </div>
          <div className="rounded-2xl p-4 flex items-center justify-between" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
            <div>
              <p className="text-[10px] font-bold tracking-[0.08em]" style={{ color: 'var(--text-muted)' }}>DUE THIS WEEK</p>
              <p className="text-[22px] font-extrabold tracking-tight mt-1" style={{ color: summary.dueAmt > 0 ? 'var(--amber)' : 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{fmt(summary.dueAmt)}</p>
            </div>
            {summary.dueCount > 0 && <span className="text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0" style={{ color: 'var(--amber)', background: 'var(--accent-light)' }}>{summary.dueCount} card{summary.dueCount !== 1 ? 's' : ''}</span>}
          </div>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="card p-8 text-center space-y-2">
          <PiggyBank className="w-8 h-8 mx-auto" style={{ color: 'var(--text-faint)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No credit card accounts yet. Add an account with type "Credit" and it will appear here.
          </p>
        </div>
      ) : (
        cards.map(c => (
          <SingleCard
            key={c.id}
            card={c}
            txns={txnsByCard[c.id] ?? []}
            bankAmounts={bankByCard[c.id] ?? {}}
            stmtRows={rowsByCard[c.id] ?? {}}
            payAccounts={payAccounts}
            onSaved={() => router.refresh()}
          />
        ))
      )}
    </div>
  )
}
