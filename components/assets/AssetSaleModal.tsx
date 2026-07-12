'use client'

import { useMemo, useState } from 'react'
import { X, Loader2, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/shared/Toast'
import AmountField from '@/components/shared/AmountField'
import AccountChipPicker, { type PickerAccount } from '@/components/shared/AccountChipPicker'
import type { Asset } from '@/lib/assets/types'
import {
  netProceeds, realisedGain, validateSale, salePatch,
  SALE_CATEGORY_NAME, saleTransactionName, saleTransactionNote,
} from '@/lib/assets/sale'

const inr = (n: number) =>
  (n < 0 ? '−' : '') + '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Math.abs(n))

/**
 * Record the sale of an asset — properly.
 *
 * A sale isn't done when a price is agreed; it's done when the money is in an
 * account. So this captures the gross price, what the bank and the taxman took,
 * and where the remainder landed. If the money hasn't arrived yet you can say so,
 * and settle it later without re-entering anything.
 *
 * When the money HAS arrived we write a real income transaction for the NET
 * amount — the figure that appears on the bank statement — so the account
 * balance is right and the line reconciles. Charges and tax stay on the asset and
 * come off the realised gain.
 */
export default function AssetSaleModal({
  asset, currentValue, cost, accounts, mode = 'sell', onSaved, onClose,
}: {
  asset: Asset
  currentValue: number
  cost: number
  accounts: PickerAccount[]
  /** 'sell' = record the sale. 'settle' = the sale exists, the money just arrived. */
  mode?: 'sell' | 'settle'
  onSaved: (a: Asset) => void
  onClose: () => void
}) {
  const settling = mode === 'settle'
  const today = new Date().toISOString().slice(0, 10)

  const [gross, setGross] = useState(String(asset.sold_price ?? Math.round(currentValue) ?? ''))
  const [charges, setCharges] = useState(String(asset.sale_charges || ''))
  const [tax, setTax] = useState(String(asset.sale_tax || ''))
  const [soldDate, setSoldDate] = useState(asset.sold_date ?? today)
  const [buyer, setBuyer] = useState(asset.sale_buyer ?? '')
  const [reference, setReference] = useState(asset.sale_reference ?? '')

  // When settling an existing sale the money is, by definition, in.
  const [received, setReceived] = useState(settling)
  const [accountId, setAccountId] = useState<string | null>(asset.sale_account_id ?? null)
  const [receivedDate, setReceivedDate] = useState(asset.sale_received_date ?? today)

  const [saving, setSaving] = useState(false)

  const sale = useMemo(
    () => ({ gross: Number(gross) || 0, charges: Number(charges) || 0, tax: Number(tax) || 0 }),
    [gross, charges, tax],
  )
  const net = netProceeds(sale)
  const gain = realisedGain(sale, cost)
  const check = validateSale(sale, { markReceived: received, accountId, date: soldDate })

  async function save() {
    if (!check.ok) { notify(check.errors[0], 'error'); return }
    setSaving(true)
    try {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return

      // The money actually moved → book it. One credit, for the net amount, on
      // the day it landed. That is the line the bank will show.
      let transactionId: string | null = asset.sale_transaction_id ?? null
      if (received && accountId && !transactionId) {
        // File it under "Sale of Asset" so it doesn't land in the transaction
        // list as an untitled, uncategorised credit. Create the category once if
        // it isn't there yet — an asset sale always has somewhere to go.
        let categoryId: string | null = null
        const { data: cat } = await sb.from('categories')
          .select('id').eq('user_id', user.id).eq('type', 'income')
          .ilike('name', SALE_CATEGORY_NAME).maybeSingle()

        if (cat?.id) {
          categoryId = cat.id as string
        } else {
          const { data: made } = await sb.from('categories').insert({
            user_id: user.id, name: SALE_CATEGORY_NAME, type: 'income',
            icon: 'tag', color: '#1F5C3A',
          }).select('id').single()
          categoryId = (made?.id as string) ?? null
        }

        const { data: txn, error: txnErr } = await sb.from('transactions').insert({
          user_id: user.id,
          account_id: accountId,
          category_id: categoryId,
          type: 'income',
          // `name` is what the transaction list shows as the row title.
          name: saleTransactionName(asset.name),
          amount: net,
          date: receivedDate || soldDate,
          notes: saleTransactionNote(sale, { buyer, reference }) || null,
        }).select('id').single()

        if (txnErr || !txn) { notify(txnErr?.message ?? 'Could not record the credit', 'error'); return }
        transactionId = txn.id as string
      }

      const patch = salePatch(sale, {
        soldDate, buyer, reference,
        markReceived: received,
        accountId,
        receivedDate,
        transactionId,
      })

      const { data, error } = await sb.from('assets').update(patch).eq('id', asset.id).select().single()
      if (error || !data) {
        notify(error?.message ?? 'Could not save the sale', 'error')
        return
      }

      notify(received ? `Sale recorded · ${inr(net)} credited ✓` : 'Sale recorded — awaiting payment', 'success')
      onSaved(data as Asset)
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const iCls = 'w-full px-3 py-2.5 rounded-xl border text-sm mt-1'
  const iStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }
  const lbl = 'text-[11px] font-bold uppercase tracking-wide'

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4"
      style={{ background: 'rgba(0,0,0,.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[92vh]" style={{ background: 'var(--surface)' }}>
        <div className="px-5 py-3.5 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="font-extrabold" style={{ color: 'var(--text)' }}>
              {settling ? 'Record payment received' : 'Sell asset'}
            </p>
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{asset.name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)' }}>
            <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {/* ── The sale ── */}
          <div className="grid grid-cols-2 gap-3">
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Sold for
              <AmountField value={gross} onChange={setGross} title="Sale price" className={iCls} style={iStyle} disabled={settling} />
            </label>
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Date of sale
              <input type="date" value={soldDate} onChange={e => setSoldDate(e.target.value)} className={iCls} style={iStyle} disabled={settling} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Bank / brokerage charges
              <AmountField value={charges} onChange={setCharges} title="Charges deducted" className={iCls} style={iStyle} />
            </label>
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Tax deducted (TDS)
              <AmountField value={tax} onChange={setTax} title="Tax deducted" className={iCls} style={iStyle} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Buyer <span className="font-normal normal-case" style={{ color: 'var(--text-faint)' }}>(optional)</span>
              <input value={buyer} onChange={e => setBuyer(e.target.value)} placeholder="Who bought it" className={iCls} style={iStyle} />
            </label>
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Reference <span className="font-normal normal-case" style={{ color: 'var(--text-faint)' }}>(optional)</span>
              <input value={reference} onChange={e => setReference(e.target.value)} placeholder="UTR / cheque no." className={iCls} style={iStyle} />
            </label>
          </div>

          {/* ── What actually lands ── */}
          <div className="rounded-xl border p-3.5 space-y-1.5" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <Row label="Sale price" value={inr(sale.gross)} />
            {sale.charges > 0 && <Row label="Less charges" value={'− ' + inr(sale.charges)} muted />}
            {sale.tax > 0 && <Row label="Less tax deducted" value={'− ' + inr(sale.tax)} muted />}
            <div className="flex items-center justify-between pt-2 mt-1" style={{ borderTop: '1px solid var(--border)' }}>
              <span className="text-[13px] font-extrabold" style={{ color: 'var(--text)' }}>Net received</span>
              <span className="text-[17px] font-extrabold tabular-nums" style={{ color: 'var(--text)' }}>{inr(net)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Realised {gain >= 0 ? 'gain' : 'loss'} against cost of {inr(cost)}</span>
              <span className="text-[13px] font-bold tabular-nums" style={{ color: gain >= 0 ? 'var(--income, #1F5C3A)' : 'var(--expense)' }}>
                {gain >= 0 ? '+' : ''}{inr(gain)}
              </span>
            </div>
          </div>

          {/* ── The money ── */}
          {!settling && (
            <label className="flex items-center gap-2.5 text-[13px] font-bold" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={received} onChange={e => setReceived(e.target.checked)} />
              The money has been received
            </label>
          )}

          {received ? (
            <div className="space-y-3">
              <div>
                <p className={lbl} style={{ color: 'var(--text-muted)' }}>Remitted to</p>
                <div className="mt-1.5">
                  <AccountChipPicker accounts={accounts} selectedId={accountId ?? ''} onSelect={setAccountId} />
                </div>
              </div>
              <label className={lbl} style={{ color: 'var(--text-muted)' }}>Date received
                <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} className={iCls} style={iStyle} />
              </label>
              <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>
                {inr(net)} will be credited to this account as an income transaction — the net figure, so it matches the line on your bank statement.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border p-3 flex items-start gap-2" style={{ borderColor: '#f0c36d', background: 'rgba(240,195,109,.10)' }}>
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#b7791f' }} />
              <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
                The asset will be marked sold and <b>awaiting payment</b>. No money moves and no account is credited until you record the payment.
              </p>
            </div>
          )}

          {!check.ok && (
            <p className="text-[12px] font-semibold" style={{ color: 'var(--expense)' }}>{check.errors[0]}</p>
          )}
        </div>

        <div className="px-5 py-3.5 flex gap-2 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-[13px] font-bold" style={{ background: 'var(--surface-2)', color: 'var(--text)' }}>Cancel</button>
          <button
            onClick={save}
            disabled={saving || !check.ok}
            className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
            style={{ background: 'var(--brand)' }}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Saving…' : settling ? 'Record payment' : received ? 'Confirm sale' : 'Mark sold'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="text-[13px] font-semibold tabular-nums" style={{ color: muted ? 'var(--text-muted)' : 'var(--text)' }}>{value}</span>
    </div>
  )
}
