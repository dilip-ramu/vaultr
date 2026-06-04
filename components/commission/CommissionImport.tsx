'use client'

import { useState, useRef } from 'react'
import { X, Upload, Download, CheckCircle2, AlertCircle } from 'lucide-react'
import type { CommissionOrder, Customer, Account } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { getTodayString } from '@/lib/utils'

interface Props {
  customers: Customer[]
  accounts: Account[]
  onImported: (orders: CommissionOrder[]) => void
  onClose: () => void
}

interface ParsedRow {
  customer_name: string
  order_number: string
  order_date: string
  etd: string
  quantity: number
  rate_per_piece: number
  commission_type: string
  commission_value: number
  currency: string
  payment_term: string
  notes: string
  // resolved
  customer_id?: string
  error?: string
}

const TEMPLATE_HEADERS = [
  'customer_name', 'order_number', 'order_date', 'etd',
  'quantity', 'rate_per_piece', 'commission_type', 'commission_value',
  'currency', 'payment_term', 'notes',
]

const TEMPLATE_EXAMPLE = [
  'Acme Corp', 'ORD-001', getTodayString(), '', '500', '120', 'percentage', '10', 'EUR', 'net_30', 'First batch',
]

function downloadTemplate() {
  const rows = [TEMPLATE_HEADERS.join(','), TEMPLATE_EXAMPLE.join(',')]
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'commission_import_template.csv'
  a.click()
}

function parseCSV(text: string): string[][] {
  return text.trim().split('\n').map(line => {
    const cells: string[] = []
    let cur = '', inQ = false
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue }
      if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; continue }
      cur += ch
    }
    cells.push(cur.trim())
    return cells
  })
}

export default function CommissionImport({ customers, accounts, onImported, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows]     = useState<ParsedRow[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [done, setDone]     = useState(false)

  const customerMap = Object.fromEntries(
    customers.map(c => [c.name.toLowerCase(), c.id])
  )

  const handleFile = (file: File) => {
    setError(''); setRows([])
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const text  = e.target?.result as string
        const lines = parseCSV(text)
        const headers = lines[0].map(h => h.toLowerCase().replace(/\s+/g, '_'))
        const idx = (name: string) => headers.indexOf(name)

        const parsed: ParsedRow[] = lines.slice(1).filter(r => r.some(c => c)).map(r => {
          const get = (col: string) => r[idx(col)] ?? ''
          const customerName = get('customer_name')
          const customerId   = customerMap[customerName.toLowerCase()]
          const commType     = get('commission_type') || 'percentage'
          const qty          = parseFloat(get('quantity'))  || 0
          const rate         = parseFloat(get('rate_per_piece')) || 0
          const commVal      = parseFloat(get('commission_value')) || 0

          const row: ParsedRow = {
            customer_name:    customerName,
            order_number:     get('order_number'),
            order_date:       get('order_date') || getTodayString(),
            etd:              get('etd'),
            quantity:         qty,
            rate_per_piece:   rate,
            commission_type:  commType,
            commission_value: commVal,
            currency:         get('currency') || 'INR',
            payment_term:     get('payment_term') || 'net_30',
            notes:            get('notes'),
            customer_id:      customerId,
          }
          if (!customerId) row.error = `Customer "${customerName}" not found`
          if (!qty || !rate) row.error = (row.error ? row.error + '; ' : '') + 'Quantity and rate required'
          return row
        })
        setRows(parsed)
      } catch {
        setError('Could not parse CSV. Download the template and try again.')
      }
    }
    reader.readAsText(file)
  }

  const validRows   = rows.filter(r => !r.error)
  const invalidRows = rows.filter(r => r.error)

  const handleImport = async () => {
    if (!validRows.length) return
    setSaving(true); setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Fetch exchange rates for non-INR currencies
    let rates: Record<string, number> = {}
    const foreignCurrencies = [...new Set(validRows.filter(r => r.currency !== 'INR').map(r => r.currency))]
    if (foreignCurrencies.length > 0) {
      try {
        const res = await fetch('/api/exchange-rates')
        const json = await res.json()
        rates = json.rates ?? {}
      } catch {}
    }

    const payload = validRows.map(r => {
      const total = r.quantity * r.rate_per_piece
      const commAmount = r.commission_type === 'percentage'
        ? total * (r.commission_value / 100)
        : r.commission_type === 'per_piece'
        ? r.quantity * r.commission_value
        : r.commission_value
      const exRate = r.currency !== 'INR' ? (rates[r.currency] ?? null) : null
      const commInr = r.currency === 'INR' ? commAmount : (exRate ? commAmount * exRate : commAmount)

      return {
        user_id:              user!.id,
        customer_id:          r.customer_id!,
        account_id:           accounts[0]?.id ?? null,
        order_number:         r.order_number || null,
        order_date:           r.order_date,
        etd:                  r.etd || null,
        quantity:             r.quantity,
        rate_per_piece:       r.rate_per_piece,
        total_value:          total,
        commission_type:      r.commission_type,
        commission_percentage: r.commission_type === 'percentage' ? r.commission_value : null,
        commission_per_piece:  r.commission_type === 'per_piece'  ? r.commission_value : null,
        commission_fixed:      r.commission_type === 'fixed'      ? r.commission_value : null,
        currency:             r.currency,
        commission_amount:    commAmount,
        exchange_rate:        exRate,
        commission_inr:       commInr,
        payment_term:         r.payment_term || null,
        notes:                r.notes || null,
        order_status:         'current',
      }
    })

    const { data, error: err } = await supabase
      .from('commission_orders')
      .insert(payload)
      .select('*, customer:customers(*), account:accounts(id,name)')

    if (err) { setError(err.message); setSaving(false); return }
    setDone(true)
    setTimeout(() => onImported(data ?? []), 1200)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
         style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full md:max-w-lg rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col slide-up"
           style={{ backgroundColor: 'var(--surface)', maxHeight: '100%' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0"
             style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Import from CSV</h2>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4" style={{ overscrollBehavior: 'contain' }}>
          {done ? (
            <div className="text-center py-10">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="font-semibold" style={{ color: 'var(--text)' }}>Imported {validRows.length} entries</p>
            </div>
          ) : (
            <>
              {/* Template download */}
              <button onClick={downloadTemplate}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-all"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface-2)' }}>
                <Download className="w-4 h-4" /> Download CSV template
              </button>

              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                commission_type: <code>percentage</code>, <code>per_piece</code>, or <code>fixed</code>.
                payment_term: <code>net_30</code>, <code>net_15</code>, <code>net_60</code>, etc.
                Customer name must match exactly.
              </p>

              {/* File drop zone */}
              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                className="border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                <Upload className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">Click or drag CSV file here</p>
                <input ref={fileRef} type="file" accept=".csv" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-50 text-red-600 text-sm rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}

              {rows.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                    {validRows.length} valid · {invalidRows.length} with errors
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {rows.map((r, i) => (
                      <div key={i} className="flex items-center justify-between rounded-xl px-3 py-2 text-xs"
                           style={{ background: r.error ? 'rgba(239,68,68,0.06)' : 'var(--surface-2)' }}>
                        <span style={{ color: r.error ? '#dc2626' : 'var(--text)' }}>
                          {r.customer_name} — #{r.order_number || '—'} · {r.quantity} pcs
                        </span>
                        {r.error
                          ? <span className="text-red-500 ml-2">{r.error}</span>
                          : <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                      </div>
                    ))}
                  </div>

                  {validRows.length > 0 && (
                    <button onClick={handleImport} disabled={saving}
                      className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
                      style={{ background: 'var(--brand)' }}>
                      {saving ? 'Importing…' : `Import ${validRows.length} entr${validRows.length === 1 ? 'y' : 'ies'}`}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
