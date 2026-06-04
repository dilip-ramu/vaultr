'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CreditCard, AlertTriangle, PiggyBank } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cardOverview, type CardTxn } from '@/lib/cards'

interface CardAccount {
  id: string
  name: string
  color: string | null
  avatar_url: string | null
  initial_balance: number
  statement_day: number | null
  statement_due_day: number | null
}

interface Props {
  cards: CardAccount[]
  txns: CardTxn[]
  statements: { account_id: string; statement_date: string; bank_amount: number }[]
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

function SingleCard({ card, txns, bankAmounts, onSaved }: {
  card: CardAccount
  txns: CardTxn[]
  bankAmounts: Record<string, number>
  onSaved: () => void
}) {
  const supabase = createClient()
  const [stmtDay, setStmtDay] = useState(card.statement_day)
  const [dueDay, setDueDay] = useState(card.statement_due_day)
  const [editing, setEditing] = useState<string | null>(null) // statement_date being edited
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

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
    await supabase.from('accounts').update({ [field]: value }).eq('id', card.id)
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

  return (
    <div className="card p-4 space-y-4">
      {/* Card header + cycle settings */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4" style={{ color: card.color ?? 'var(--brand)' }} />
          <h2 className="text-heading" style={{ color: 'var(--text)' }}>{card.name}</h2>
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
          {/* Headline strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-caption">Latest statement ({latest ? formatDate(latest.statementDate) : '—'})</p>
              <p className="text-heading" style={{ color: 'var(--text)' }}>
                {latest ? fmt(latest.bankAmount ?? latest.calculatedAmount) : '—'}
              </p>
            </div>
            <div>
              <p className="text-caption">Still to pay{latest?.dueDate ? ` by ${formatDate(latest.dueDate)}` : ''}</p>
              <p className="text-heading" style={{ color: latest && latest.remainingDue > 0 ? 'var(--expense)' : 'var(--income)' }}>
                {latest ? fmt(latest.remainingDue) : '—'}
              </p>
            </div>
            <div>
              <p className="text-caption">Spent this cycle (since {formatDate(overview.currentCycleStart)})</p>
              <p className="text-heading" style={{ color: 'var(--text)' }}>{fmt(overview.currentCycleSpend)}</p>
            </div>
            <div>
              <p className="text-caption">Hidden charges · {overview.cyclesWithBankAmount} statement{overview.cyclesWithBankAmount !== 1 ? 's' : ''} checked</p>
              <p className="text-heading" style={{ color: overview.totalHiddenCharges > 0 ? 'var(--expense)' : 'var(--income)' }}>
                {fmt(overview.totalHiddenCharges)}
              </p>
            </div>
          </div>

          {/* Cycle history */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
          <p className="text-caption">
            "Bank said" — type in the closing balance from the bank's statement SMS/PDF. The difference is interest,
            fees and GST the bank added that your transactions don't show.
          </p>
        </>
      )}
    </div>
  )
}

export default function CardsClient({ cards, txns, statements }: Props) {
  const router = useRouter()

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

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-heading" style={{ color: 'var(--text)' }}>Credit Cards</h1>
          <p className="text-caption">Statement amounts, due dates — and what the bank quietly charges you</p>
        </div>
        {grandTotal > 0 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
               style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertTriangle className="w-4 h-4" style={{ color: 'var(--expense)' }} />
            <span style={{ color: 'var(--text)' }}>
              Hidden charges last 12 months: <strong style={{ color: 'var(--expense)' }}>{fmt(grandTotal)}</strong>
            </span>
          </div>
        )}
      </div>

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
            onSaved={() => router.refresh()}
          />
        ))
      )}
    </div>
  )
}
