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

// Your actual CSV columns (case-insensitive, flexible spacing/underscores)
// style number, customer, PO number, ETD, price, currency, commission percentage, quantity
function normalise(h: string) {
  return h.toLowerCase().replace(/[\s_-]+/g, '')
}

const COL_MAP: Record<string, string> = {
  'stylenumber':          'style_ref',
  'styleno':              'style_ref',
  'style':                'style_ref',
  'customer':             'customer',
  'ponumber':             'po_number',
  'po':                   'po_number',
  'ordernumber':          'po_number',
  'etd':                  'etd',
  'price':                'rate_per_piece',
  'rateperpiec':          'rate_per_piece',
  'rate':                 'rate_per_piece',
  'currency':             'currency',
  'commissionpercentage': 'commission_pct',
  'commission%':          'commission_pct',
  'commission':           'commission_pct',
  'quantity':             'quantity',
  'qty':                  'quantity',
}

function mapHeader(raw: string): string {
  return COL_MAP[normalise(raw)] ?? normalise(raw)
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

function downloadTemplate() {
  const header = 'style number,customer,PO number,ETD,price,currency,commission percentage,quantity'
  const example = 'STY-001,Acme Corp,PO-2024-001,2024-07-15,12.50,EUR,10,200'
  const blob = new Blob([[header, example].join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'commission_import_template.csv'
  a.click()
}

interface ParsedStyle {
  style_ref: string
  customer_name: string
  po_number: string
  etd: string
  rate_per_piece: number
  currency: string
  commission_pct: number
  quantity: number
  // resolved
  customer_id?: string
  error?: string
}

export default function CommissionImport({ customers, accounts, onImported, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows,   setRows]   = useState<ParsedStyle[]>([])
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')
  const [done,   setDone]   = useState(false)

  const customerMap = Object.fromEntries(customers.map(c => [c.name.toLowerCase().trim(), c.id]))

  const handleFile = (file: File) => {
    setError(''); setRows([])
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const lines   = parseCSV(e.target?.result as string)
        const headers = lines[0].map(mapHeader)
        const get     = (row: string[], col: string) => row[headers.indexOf(col)] ?? ''

        const parsed: ParsedStyle[] = lines.slice(1).filter(r => r.some(c => c)).map(r => {
          const custName = get(r, 'customer').trim()
          const row: ParsedStyle = {
            style_ref:      get(r, 'style_ref').trim(),
            customer_name:  custName,
            po_number:      get(r, 'po_number').trim(),
            etd:            get(r, 'etd').trim(),
            rate_per_piece: parseFloat(get(r, 'rate_per_piece')) || 0,
            currency:       get(r, 'currency').trim().toUpperCase() || 'INR',
            commission_pct: parseFloat(get(r, 'commission_pct')) || 0,
            quantity:       parseFloat(get(r, 'quantity')) || 0,
            customer_id:    customerMap[custName.toLowerCase()],
          }
          const errs: string[] = []
          if (!row.customer_id) errs.push(`Customer "${custName}" not found`)
          if (!row.quantity)    errs.push('Quantity missing')
          if (!row.rate_per_piece) errs.push('Price missing')
          if (errs.length) row.error = errs.join('; ')
          return row
        })
        setRows(parsed)
      } catch {
        setError('Could not parse file — download the template and check your format.')
      }
    }
    reader.readAsText(file)
  }

  const valid   = rows.filter(r => !r.error)
  const invalid = rows.filter(r => r.error)

  const handleImport = async () => {
    if (!valid.length) return
    setSaving(true); setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Fetch exchange rates for foreign currencies
    const foreignCurrencies = [...new Set(valid.filter(r => r.currency !== 'INR').map(r => r.currency))]
    let rates: Record<string, number> = {}
    if (foreignCurrencies.length > 0) {
      try {
        const res = await fetch('/api/exchange-rates')
        const json = await res.json()
        rates = json.rates ?? {}
      } catch {}
    }

    // Group rows into orders by (customer_id + po_number)
    const orderMap = new Map<string, ParsedStyle[]>()
    for (const row of valid) {
      const key = `${row.customer_id}|${row.po_number.toLowerCase()}`
      if (!orderMap.has(key)) orderMap.set(key, [])
      orderMap.get(key)!.push(row)
    }

    const createdOrders: CommissionOrder[] = []

    for (const [, styleRows] of orderMap) {
      const first    = styleRows[0]
      const currency = first.currency
      const rate     = currency !== 'INR' ? (rates[currency] ?? null) : null

      // Create order
      const { data: order, error: oErr } = await supabase
        .from('commission_orders')
        .insert({
          user_id:      user!.id,
          customer_id:  first.customer_id!,
          account_id:   accounts[0]?.id ?? null,
          order_number: first.po_number || null,
          order_date:   getTodayString(),
          payment_term: 'net_30',
          currency,
          exchange_rate: rate,
        })
        .select('id')
        .single()

      if (oErr) continue

      // Create style lines
      const stylePayloads = styleRows.map(s => {
        const total = s.quantity * s.rate_per_piece
        const comm  = total * (s.commission_pct / 100)
        const inr   = currency === 'INR' ? comm : (rate ? comm * rate : comm)
        return {
          order_id:       order.id,
          user_id:        user!.id,
          style_ref:      s.style_ref || null,
          quantity:       s.quantity,
          rate_per_piece: s.rate_per_piece,
          total_value:    total,
          commission_type: 'percentage',
          commission_percentage: s.commission_pct,
          commission_amount: comm,
          commission_inr:    inr,
          order_status:    'current',
          etd:             s.etd || null,
        }
      })

      await supabase.from('commission_styles').insert(stylePayloads)

      // Fetch full order
      const { data: full } = await supabase
        .from('commission_orders')
        .select('*, customer:customers(*), account:accounts(id,name), styles:commission_styles(*)')
        .eq('id', order.id)
        .single()

      if (full) createdOrders.push(full)
    }

    setDone(true)
    setTimeout(() => onImported(createdOrders), 1200)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
         style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full md:max-w-lg rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col slide-up"
           style={{ backgroundColor: 'var(--surface)', maxHeight: '100%' }}>

        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
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
              <p className="font-semibold" style={{ color: 'var(--text)' }}>Imported {valid.length} style{valid.length !== 1 ? 's' : ''}</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Grouped into {Math.ceil(valid.length / 1)} order(s)</p>
            </div>
          ) : (
            <>
              <button onClick={downloadTemplate}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface-2)' }}>
                <Download className="w-4 h-4" /> Download CSV template
              </button>

              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                Columns: <code>style number, customer, PO number, ETD, price, currency, commission percentage, quantity</code>.
                Rows with the same PO number + customer are grouped into one order automatically.
                Customer name must match exactly what's in your directory.
              </p>

              <div
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                className="border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                <Upload className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">Click or drag CSV here</p>
                <input ref={fileRef} type="file" accept=".csv,.CSV" className="hidden"
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
                    {valid.length} valid · {invalid.length} with errors
                  </p>
                  <div className="space-y-1 max-h-52 overflow-y-auto">
                    {rows.map((r, i) => (
                      <div key={i}
                        className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                        style={{ background: r.error ? 'rgba(239,68,68,0.06)' : 'var(--surface-2)' }}>
                        <span style={{ color: r.error ? '#dc2626' : 'var(--text)' }}>
                          {r.style_ref || '—'} · {r.customer_name} · {r.po_number || '—'}
                        </span>
                        {r.error
                          ? <span className="text-red-500 ml-2 shrink-0">{r.error}</span>
                          : <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0 ml-2" />}
                      </div>
                    ))}
                  </div>
                  {valid.length > 0 && (
                    <button onClick={handleImport} disabled={saving}
                      className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
                      style={{ background: 'var(--brand)' }}>
                      {saving ? 'Importing…' : `Import ${valid.length} style${valid.length !== 1 ? 's' : ''}`}
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
