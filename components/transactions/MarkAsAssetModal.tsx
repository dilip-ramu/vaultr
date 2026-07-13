'use client'

import { useMemo, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { notify } from '@/components/shared/Toast'
import { ASSET_CATEGORIES_SORTED, sortedCategoryDef } from '@/lib/assets/types'
import type { Asset } from '@/lib/assets/types'

const inr = (n: number) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0)

/**
 * Turn an expense into an asset you own.
 *
 * The money already left the account — that's the transaction. What was missing
 * is that the thing it bought is still yours, and belongs on the balance sheet.
 * This creates the asset and LINKS it back to the expense, so:
 *   • its cost is the money that actually left (no re-typing, no drift),
 *   • the expense stops looking like consumption when it was a purchase,
 *   • and you can't accidentally book two assets against one payment.
 *
 * Market- and rate-linked categories (gold, land…) need a weight or an area
 * before they can be valued live. We don't fake that: the asset is created at
 * its purchase price and we tell you to go and add the details.
 */
export default function MarkAsAssetModal({
  transaction, onSaved, onClose,
}: {
  transaction: { id: string; name: string | null; amount: number; date: string; notes?: string | null }
  onSaved: (a: Asset) => void
  onClose: () => void
}) {
  const [name, setName] = useState(transaction.name?.trim() || '')
  const [categoryKey, setCategoryKey] = useState(ASSET_CATEGORIES_SORTED[0].key)
  // Sorted def: its sub-categories come out alphabetical, so the dropdown below
  // needs no sorting of its own and cannot drift out of step with the others.
  const cat = useMemo(() => sortedCategoryDef(categoryKey)!, [categoryKey])
  const [subKey, setSubKey] = useState(cat.subcategories[0]?.key ?? '')
  const [companyId, setCompanyId] = useState('')
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [saving, setSaving] = useState(false)

  useMemo(() => {
    const sb = createClient()
    sb.from('companies').select('id, name').order('is_default', { ascending: false }).order('name')
      .then(({ data }) => setCompanies((data ?? []) as { id: string; name: string }[]))
  }, [])

  const sub = cat.subcategories.find(s => s.key === subKey) ?? cat.subcategories[0]
  const valuationType = sub?.valuation ?? (cat.valuation === 'mixed' ? 'building' : cat.valuation)

  // Gold needs grams, land needs cents — until those are filled in there is
  // nothing to value it against, so it's held at what it cost.
  const needsDetail = valuationType === 'market' || valuationType === 'rate' || valuationType === 'building'
  const cost = Math.abs(Number(transaction.amount) || 0)

  async function save() {
    if (!name.trim()) { notify('Give the asset a name', 'info'); return }
    setSaving(true)
    try {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return

      const { data, error } = await sb.from('assets').insert({
        user_id: user.id,
        name: name.trim(),
        category: categoryKey,
        subcategory: subKey,
        valuation_type: valuationType,
        purchase_date: transaction.date,
        cost_total: cost,
        // The cost IS the money that left the account.
        details: { purchase_cost: cost, currency: 'INR' },
        // Held at cost until the weight / area is entered; otherwise a gold
        // asset with no grams would be valued at zero.
        manual_value: needsDetail ? cost : null,
        company_id: companyId || null,
        include_in_net_worth: true,
        status: 'held',
        purchase_transaction_id: transaction.id,
      }).select().single()

      if (error || !data) {
        notify(
          error?.message?.includes('uq_assets_purchase_txn')
            ? 'This transaction is already linked to an asset.'
            : (error?.message ?? 'Could not create the asset'),
          'error',
        )
        return
      }

      notify(`${name.trim()} added to assets ✓`, 'success')
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
      <div className="w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl flex flex-col max-h-[92vh]" style={{ background: 'var(--surface)' }}>
        <div className="px-5 py-3.5 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="font-extrabold" style={{ color: 'var(--text)' }}>Mark as asset</p>
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              {inr(cost)} · {transaction.date}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--surface-2)' }}>
            <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3.5 overflow-y-auto">
          <label className={lbl} style={{ color: 'var(--text-muted)' }}>Asset name
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Embroidery machine" className={iCls} style={iStyle} />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Category
              <select
                value={categoryKey}
                onChange={e => {
                  setCategoryKey(e.target.value)
                  const c = sortedCategoryDef(e.target.value)
                  setSubKey(c?.subcategories[0]?.key ?? '')
                }}
                className={iCls}
                style={iStyle}
              >
                {ASSET_CATEGORIES_SORTED.map(c => <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>)}
              </select>
            </label>
            <label className={lbl} style={{ color: 'var(--text-muted)' }}>Type
              <select value={subKey} onChange={e => setSubKey(e.target.value)} className={iCls} style={iStyle}>
                {cat.subcategories.map(sc => <option key={sc.key} value={sc.key}>{sc.label}</option>)}
              </select>
            </label>
          </div>

          <label className={lbl} style={{ color: 'var(--text-muted)' }}>Company <span className="font-normal normal-case" style={{ color: 'var(--text-faint)' }}>(optional)</span>
            <select value={companyId} onChange={e => setCompanyId(e.target.value)} className={iCls} style={iStyle}>
              <option value="">Personal / unassigned</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>

          <div className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
            <div className="flex items-center justify-between">
              <span className="text-[12.5px]" style={{ color: 'var(--text-muted)' }}>Cost</span>
              <span className="text-[15px] font-extrabold tabular-nums" style={{ color: 'var(--text)' }}>{inr(cost)}</span>
            </div>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>
              Taken from the transaction — it&apos;s the money that actually left the account, so it can&apos;t drift.
            </p>
          </div>

          {needsDetail && (
            <p className="text-[11.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              {cat.label} is valued from live rates. It&apos;ll be held at its purchase price until you open it in
              Assets and add the {valuationType === 'market' ? 'weight and purity' : 'area and rate'}.
            </p>
          )}
        </div>

        <div className="px-5 py-3.5 flex gap-2 shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-[13px] font-bold" style={{ background: 'var(--surface-2)', color: 'var(--text)' }}>Cancel</button>
          <button
            onClick={save}
            disabled={saving || !name.trim()}
            className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-bold inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
            style={{ background: 'var(--brand)' }}
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Adding…' : 'Add to assets'}
          </button>
        </div>
      </div>
    </div>
  )
}
