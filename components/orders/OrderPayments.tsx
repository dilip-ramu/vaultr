'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Loader2, Download, Banknote, FileMinus, FilePlus } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { confirmDialog } from '@/components/shared/ConfirmDialog'
import { money } from '@/lib/documents/money'
import {
  PAYMENT_KINDS, paymentTotals, supplierBalance, balanceWords, kindLabel,
  direction, paymentProblem, type PaymentKind,
} from '@/lib/orders/payments'
import { paymentSlipDocModel, paymentSlipFilename, type PaymentSlipInput } from '@/lib/orders/paymentSlip'

export interface OrderPaymentRow {
  id: string
  kind: PaymentKind
  amount: number
  paid_date: string
  account_id: string | null
  party_name: string | null
  reference: string | null
  note: string | null
  transaction_id: string | null
}

interface Props {
  orderId: string
  orderNumber: string
  customerPoNo: string | null
  locked: boolean
  payments: OrderPaymentRow[]
  accounts: { id: string; name: string }[]
  suppliers: { id: string; name: string }[]
  /** Everything the supplier has billed on this order. */
  billedTotal: number
  /** Who the purchase order went to, if one has been raised. */
  defaultParty: string | null
  /** Letterhead for the slip. */
  brand: Omit<PaymentSlipInput, 'number' | 'kind' | 'amount' | 'date' | 'orderNumber'>
}

const card = { borderColor: 'var(--border)', background: 'var(--surface)' }
const iStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }
const iCls = 'w-full px-3 py-2 rounded-lg border text-sm mt-1'

export default function OrderPayments(p: Props) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [slipBusy, setSlipBusy] = useState<string | null>(null)

  const [kind, setKind] = useState<PaymentKind>('advance')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [accountId, setAccountId] = useState(p.accounts[0]?.id ?? '')
  const [supplierId, setSupplierId] = useState('')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')

  const totals = paymentTotals(p.payments)
  const balance = supplierBalance(p.billedTotal, p.payments)
  const accountName = (id: string | null) => p.accounts.find(a => a.id === id)?.name ?? null

  async function add() {
    const partyName = p.suppliers.find(s => s.id === supplierId)?.name ?? p.defaultParty ?? null
    const input = { kind, amount: parseFloat(amount), date, accountId, partyName, reference, note }
    const bad = paymentProblem(input)
    if (bad) { notify(bad, 'info'); return }

    setBusy(true)
    try {
      const res = await fetch(`/api/orders/${p.orderId}/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, supplierId: supplierId || null }),
      })
      const data = await res.json()
      if (!res.ok) { notify(data.error ?? 'Could not record that', 'error'); return }
      notify(`${kindLabel(kind)} recorded — the bank entry is posted too`, 'success')
      setAdding(false); setAmount(''); setReference(''); setNote('')
      router.refresh()
    } finally { setBusy(false) }
  }

  async function remove(row: OrderPaymentRow) {
    const ok = await confirmDialog({
      title: `Delete this ${kindLabel(row.kind).toLowerCase()}?`,
      message: row.transaction_id
        ? `${money(row.amount)} on ${row.paid_date}. The bank entry it posted goes with it, and the account balance changes.`
        : `${money(row.amount)} on ${row.paid_date}. There is no bank entry linked to it.`,
      confirmLabel: 'Delete',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await fetch(`/api/orders/${p.orderId}/payments?paymentId=${row.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { notify(data.error ?? 'Could not delete', 'error'); return }
      notify('Deleted, bank entry and all', 'success')
      router.refresh()
    } finally { setBusy(false) }
  }

  async function slip(row: OrderPaymentRow) {
    setSlipBusy(row.id)
    try {
      const { downloadDocModelPdf } = await import('@/lib/pdf/renderDocModelPdf')
      const input: PaymentSlipInput = {
        ...p.brand,
        number: row.reference?.trim() || row.id.slice(0, 8).toUpperCase(),
        kind: row.kind,
        amount: Number(row.amount),
        date: row.paid_date,
        partyName: row.party_name ?? p.defaultParty ?? null,
        accountName: accountName(row.account_id),
        reference: row.reference,
        note: row.note,
        orderNumber: p.orderNumber,
        customerPoNo: p.customerPoNo,
      }
      await downloadDocModelPdf(paymentSlipDocModel(input), paymentSlipFilename(input))
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Could not make the slip', 'error')
    } finally { setSlipBusy(null) }
  }

  return (
    <div className="rounded-2xl border p-5 space-y-3" style={card}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-extrabold" style={{ color: 'var(--text)' }}>Money on this order</h2>
          <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Advances and payments to the supplier. Each one posts a real bank entry, so the balances and the
            Books move with it — and deleting one takes that entry with it.
          </p>
        </div>
        {!p.locked && (
          <button onClick={() => setAdding(v => !v)} className="shrink-0 flex items-center gap-1.5 text-[12px] font-bold" style={{ color: 'var(--brand)' }}>
            <Plus className="w-3.5 h-3.5" /> Record a payment
          </button>
        )}
      </div>

      {/* Where it stands */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-xl p-3 text-[12.5px]" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
        <span>Billed <b className="tabular-nums" style={{ color: 'var(--text)' }}>{money(p.billedTotal)}</b></span>
        <span>Paid <b className="tabular-nums" style={{ color: 'var(--text)' }}>{money(totals.net)}</b></span>
        {totals.advances > 0 && <span>of which advance <b className="tabular-nums" style={{ color: 'var(--text)' }}>{money(totals.advances)}</b></span>}
        <span className="text-[13px]">
          {balanceWords(balance) === 'Settled'
            ? <b style={{ color: 'var(--income)' }}>Settled</b>
            : <><b className="tabular-nums" style={{ color: balance > 0 ? 'var(--expense)' : 'var(--income)' }}>{money(Math.abs(balance))}</b> {balanceWords(balance)}</>}
        </span>
      </div>

      {adding && !p.locked && (
        <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>What is it
              <select value={kind} onChange={e => setKind(e.target.value as PaymentKind)} className={iCls} style={iStyle}>
                {PAYMENT_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
              </select>
              <span className="block mt-1 text-[10px] font-normal" style={{ color: 'var(--text-faint)' }}>
                {PAYMENT_KINDS.find(k => k.key === kind)?.hint}
              </span>
            </label>
            <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Amount (₹)
              <input value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" placeholder="100000" className={iCls} style={iStyle} />
            </label>
            <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Date
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className={iCls} style={iStyle} />
            </label>
            <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>
              {direction(kind) === 'in' ? 'Into which account' : 'Out of which account'}
              <select value={accountId} onChange={e => setAccountId(e.target.value)} className={iCls} style={iStyle}>
                <option value="">— pick —</option>
                {p.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Supplier
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className={iCls} style={iStyle}>
                <option value="">{p.defaultParty ?? '— pick —'}</option>
                {p.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Reference
              <input value={reference} onChange={e => setReference(e.target.value)} placeholder="NEFT / cheque no." className={iCls} style={iStyle} />
            </label>
          </div>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="What this payment is for — 30% on order confirmation, say"
            className="w-full px-3 py-2 rounded-lg border text-sm mt-3" style={iStyle} />
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setAdding(false)} className="px-3.5 py-2 rounded-xl text-[13px] font-bold" style={{ background: 'var(--surface)', color: 'var(--text)' }}>Cancel</button>
            <button onClick={add} disabled={busy} className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-white text-[13px] font-bold disabled:opacity-60" style={{ background: 'var(--brand)' }}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />} Record and post
            </button>
          </div>
        </div>
      )}

      {p.payments.length === 0 ? (
        <p className="text-[13px] py-2" style={{ color: 'var(--text-faint)' }}>Nothing paid on this order yet.</p>
      ) : (
        <div className="space-y-1.5">
          {p.payments.map(row => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2" style={{ background: 'var(--surface-2)' }}>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
                  {kindLabel(row.kind)}
                  {row.party_name && <span style={{ color: 'var(--text-muted)' }}> · {row.party_name}</span>}
                </div>
                <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                  {row.paid_date}
                  {accountName(row.account_id) && ` · ${accountName(row.account_id)}`}
                  {row.reference && ` · ${row.reference}`}
                  {/* A payment whose bank entry was deleted elsewhere. Said
                      plainly rather than quietly showing a figure that is no
                      longer in the balances. */}
                  {!row.transaction_id && <span style={{ color: 'var(--expense)' }}> · no bank entry</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[14px] font-extrabold tabular-nums" style={{ color: direction(row.kind) === 'in' ? 'var(--income)' : 'var(--text)' }}>
                  {direction(row.kind) === 'in' ? '+' : '−'}{money(row.amount)}
                </span>
                <button onClick={() => slip(row)} disabled={slipBusy === row.id}
                  className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface)' }}
                  aria-label={direction(row.kind) === 'in' ? 'Receipt' : 'Payment slip'}>
                  {slipBusy === row.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />}
                </button>
                {!p.locked && (
                  <button onClick={() => remove(row)} disabled={busy}
                    className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface)' }} aria-label="Delete">
                    <Trash2 className="w-3.5 h-3.5 text-[var(--expense)]" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Adjustments both ways. These are documents, not cash — the money
          follows when the note is settled. */}
      {!p.locked && (
        <div className="flex flex-wrap gap-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
          <Link href={`/suppliers/documents/debit_note/new?fromOrder=${p.orderId}`}
            className="flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--brand)' }}>
            <FileMinus className="w-3.5 h-3.5" /> Debit note — supplier owes me
          </Link>
          <Link href={`/suppliers/documents/credit_note/new?fromOrder=${p.orderId}`}
            className="flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1.5 rounded-lg" style={{ background: 'var(--surface-2)', color: 'var(--brand)' }}>
            <FilePlus className="w-3.5 h-3.5" /> Credit note — I owe the supplier
          </Link>
        </div>
      )}
    </div>
  )
}
