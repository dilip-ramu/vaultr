'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Plus, Trash2, Loader2 } from 'lucide-react'
import { notify } from '@/components/shared/Toast'

interface CustomerOption { id: string; name: string }
interface CompanyOption {
  id: string; name: string; is_default: boolean
  cgst_rate: number; sgst_rate: number; hsn_sac: string
}
interface Props {
  customers: CustomerOption[]
  companies: CompanyOption[]
  initialCustomerId: string | null
}

interface LineDraft {
  key: string
  description: string
  hsn: string
  qty: string
  rate: string
  cgst: string
  sgst: string
}

const PAYMENT_TERMS: { value: string; label: string }[] = [
  { value: 'due_on_receipt', label: 'Due on receipt' },
  { value: 'net_7',  label: 'Net 7' },
  { value: 'net_15', label: 'Net 15' },
  { value: 'net_30', label: 'Net 30' },
  { value: 'net_60', label: 'Net 60' },
  { value: 'net_90', label: 'Net 90' },
]

const r2 = (n: number) => Math.round(n * 100) / 100
const fmt = (n: number) => '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
let seq = 0
const newKey = () => `l${++seq}`

export default function TypedInvoiceClient({ customers, companies, initialCustomerId }: Props) {
  const router = useRouter()
  const defaultCompany = companies.find(c => c.is_default) ?? companies[0] ?? null

  const [customerId, setCustomerId] = useState<string>(initialCustomerId ?? '')
  const [companyId, setCompanyId]   = useState<string>(defaultCompany?.id ?? '')
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [paymentTerms, setPaymentTerms] = useState('due_on_receipt')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const company = companies.find(c => c.id === companyId) ?? defaultCompany

  const seedLine = (): LineDraft => ({
    key: newKey(),
    description: '',
    hsn:  company?.hsn_sac ?? '996812',
    qty:  '1',
    rate: '',
    cgst: String(company?.cgst_rate ?? 9),
    sgst: String(company?.sgst_rate ?? 9),
  })
  const [lines, setLines] = useState<LineDraft[]>(() => [seedLine()])

  function updateLine(key: string, patch: Partial<LineDraft>) {
    setLines(prev => prev.map(l => l.key === key ? { ...l, ...patch } : l))
  }
  function addLine() { setLines(prev => [...prev, seedLine()]) }
  function removeLine(key: string) {
    setLines(prev => prev.length > 1 ? prev.filter(l => l.key !== key) : prev)
  }

  const computed = useMemo(() => {
    const rows = lines.map(l => {
      const qty = Number(l.qty) || 0
      const rate = Number(l.rate) || 0
      const amount = r2(qty * rate)
      const cgst = r2(amount * (Number(l.cgst) || 0) / 100)
      const sgst = r2(amount * (Number(l.sgst) || 0) / 100)
      return { amount, cgst, sgst }
    })
    const subtotal = r2(rows.reduce((s, r) => s + r.amount, 0))
    const cgstTotal = r2(rows.reduce((s, r) => s + r.cgst, 0))
    const sgstTotal = r2(rows.reduce((s, r) => s + r.sgst, 0))
    return { rows, subtotal, cgstTotal, sgstTotal, total: r2(subtotal + cgstTotal + sgstTotal) }
  }, [lines])

  const canSave = customerId &&
    lines.some(l => l.description.trim() && Number(l.qty) > 0 && Number(l.rate) > 0)

  async function handleCreate() {
    if (!customerId) { notify('Pick a customer first', 'error'); return }
    const payloadLines = lines
      .filter(l => l.description.trim() && Number(l.qty) > 0 && Number(l.rate) > 0)
      .map(l => ({
        description: l.description.trim(),
        qty: Number(l.qty),
        rate: Number(l.rate),
        hsn: l.hsn.trim(),
        cgst: Number(l.cgst) || 0,
        sgst: Number(l.sgst) || 0,
      }))
    if (!payloadLines.length) { notify('Add at least one complete line', 'error'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/recoverables/invoices/typed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId, companyId, invoiceDate, paymentTerms, notes, lines: payloadLines }),
      })
      const data = await res.json()
      if (!res.ok) { notify(data.error ?? 'Could not create invoice', 'error'); return }
      notify('Invoice created', 'success')
      router.push(`/recoverables/invoices/${data.id}`)
    } catch {
      notify('Network error', 'error')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg text-sm'
  const inputStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' } as const

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-5 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href="/customers/invoices/list" className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
          <ChevronLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>New invoice</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            A blank GST tax invoice — type each line and bill it.
          </p>
        </div>
      </div>

      {/* Header fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 rounded-2xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <label className="block">
          <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Customer</span>
          <select className={inputCls} style={inputStyle} value={customerId} onChange={e => setCustomerId(e.target.value)}>
            <option value="">Select customer…</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Bill from (company)</span>
          <select className={inputCls} style={inputStyle} value={companyId} onChange={e => setCompanyId(e.target.value)}>
            {companies.length === 0 && <option value="">No companies</option>}
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}{c.is_default ? ' · default' : ''}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Invoice date</span>
          <input type="date" className={inputCls} style={inputStyle} value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Payment terms</span>
          <select className={inputCls} style={inputStyle} value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)}>
            {PAYMENT_TERMS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
      </div>

      {/* Lines */}
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: '760px' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                <th className="text-left font-semibold px-3 py-2">Description</th>
                <th className="text-left font-semibold px-3 py-2 w-[92px]">HSN/SAC</th>
                <th className="text-right font-semibold px-3 py-2 w-[70px]">Qty</th>
                <th className="text-right font-semibold px-3 py-2 w-[110px]">Rate</th>
                <th className="text-right font-semibold px-3 py-2 w-[76px]">CGST%</th>
                <th className="text-right font-semibold px-3 py-2 w-[76px]">SGST%</th>
                <th className="text-right font-semibold px-3 py-2 w-[110px]">Amount</th>
                <th className="px-2 py-2 w-[40px]"></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.key} style={{ borderTop: '1px solid var(--border-2)' }}>
                  <td className="px-2 py-1.5">
                    <input className="w-full px-2 py-1.5 rounded-md text-sm" style={inputStyle} placeholder="Item / service description" value={l.description} onChange={e => updateLine(l.key, { description: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input className="w-full px-2 py-1.5 rounded-md text-sm" style={inputStyle} value={l.hsn} onChange={e => updateLine(l.key, { hsn: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" min="0" className="w-full px-2 py-1.5 rounded-md text-sm text-right" style={inputStyle} value={l.qty} onChange={e => updateLine(l.key, { qty: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" min="0" step="0.01" className="w-full px-2 py-1.5 rounded-md text-sm text-right" style={inputStyle} placeholder="0.00" value={l.rate} onChange={e => updateLine(l.key, { rate: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" min="0" step="0.01" className="w-full px-2 py-1.5 rounded-md text-sm text-right" style={inputStyle} value={l.cgst} onChange={e => updateLine(l.key, { cgst: e.target.value })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input type="number" min="0" step="0.01" className="w-full px-2 py-1.5 rounded-md text-sm text-right" style={inputStyle} value={l.sgst} onChange={e => updateLine(l.key, { sgst: e.target.value })} />
                  </td>
                  <td className="px-3 py-1.5 text-right font-semibold" style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(computed.rows[i]?.amount ?? 0)}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <button onClick={() => removeLine(l.key)} disabled={lines.length === 1} className="w-7 h-7 rounded-md inline-flex items-center justify-center disabled:opacity-30" style={{ color: 'var(--expense)' }} title="Remove line">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2" style={{ borderTop: '1px solid var(--border-2)', background: 'var(--surface)' }}>
          <button onClick={addLine} className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ color: 'var(--brand)', background: 'var(--surface-2)' }}>
            <Plus className="w-4 h-4" /> Add line
          </button>
        </div>
      </div>

      {/* Totals + notes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <label className="block">
          <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Notes (optional)</span>
          <textarea rows={4} className="w-full px-3 py-2 rounded-lg text-sm" style={inputStyle} placeholder="Notes shown on the invoice…" value={notes} onChange={e => setNotes(e.target.value)} />
        </label>
        <div className="rounded-2xl p-4 space-y-2 text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Row label="Subtotal" value={fmt(computed.subtotal)} />
          <Row label="CGST" value={fmt(computed.cgstTotal)} />
          <Row label="SGST" value={fmt(computed.sgstTotal)} />
          <div style={{ borderTop: '1px solid var(--border)' }} className="pt-2 mt-1">
            <Row label="Total" value={fmt(computed.total)} bold />
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Link href="/customers/invoices/list" className="px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>Cancel</Link>
        <button onClick={handleCreate} disabled={!canSave || saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: 'var(--brand)' }}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Create invoice
        </button>
      </div>
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: bold ? 'var(--text)' : 'var(--text-muted)', fontWeight: bold ? 700 : 500 }}>{label}</span>
      <span style={{ color: 'var(--text)', fontWeight: bold ? 700 : 600, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}
