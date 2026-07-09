'use client'

import { useState, useRef } from 'react'
import { X, Upload, Download, CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react'
import type { CommissionOrder, Customer, Account } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { getTodayString } from '@/lib/utils'
import { useFileDrop } from '@/components/shared/useFileDrop'

interface Props {
  customers: Customer[]
  accounts: Account[]
  onImported: (orders: CommissionOrder[]) => void
  onClose: () => void
}

// Column mapping — your CSV headers (case/space/underscore insensitive)
// style number, customer, PO number, ETD, price, currency, commission percentage, quantity
function normalise(h: string) {
  return h.toLowerCase().replace(/[\s_\-\.]+/g, '')
}

const COL_MAP: Record<string, string> = {
  'stylenumber': 'style_ref',
  'styleno':     'style_ref',
  'style':       'style_ref',
  'customer':    'client_name',   // buyer/retail client — NOT the commission customer
  'client':      'client_name',
  'buyer':       'client_name',
  'ponumber':    'po_number',
  'po':          'po_number',
  'ordernumber': 'po_number',
  'etd':         'etd',
  'price':       'rate_per_piece',
  'rate':        'rate_per_piece',
  'currency':    'currency',
  'commissionpercentage': 'commission_pct',
  'commission%': 'commission_pct',
  'commission':  'commission_pct',
  'qty':         'quantity',
  'quantity':    'quantity',
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
  const ex1 = 'STY-001,H&M,PO-2024-001,2024-07-15,12.50,EUR,10,200'
  const ex2 = 'STY-002,H&M,PO-2024-001,2024-07-28,15.00,EUR,10,150'
  const blob = new Blob([[header, ex1, ex2].join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'commission_import_template.csv'
  a.click()
}

interface ParsedRow {
  style_ref: string
  client_name: string      // from "customer" column — the buyer
  po_number: string
  etd: string
  rate_per_piece: number
  currency: string
  commission_pct: number
  quantity: number
  error?: string
}

type Step = 'pick-customer' | 'pick-file' | 'preview' | 'done'

export default function CommissionImport({ customers, accounts, onImported, onClose }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  const [step,               setStep]               = useState<Step>('pick-customer')
  const [commissionCustomer, setCommissionCustomer] = useState<Customer | null>(null)
  const [rows,               setRows]               = useState<ParsedRow[]>([])
  const [saving,             setSaving]             = useState(false)
  const [error,              setError]              = useState('')

  const csvDrop = useFileDrop(f => { if (f[0]) handleFile(f[0]) })

  const handleFile = (file: File) => {
    setError(''); setRows([])
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const lines   = parseCSV(e.target?.result as string)
        const headers = lines[0].map(mapHeader)
        const get     = (row: string[], col: string) => row[headers.indexOf(col)] ?? ''

        const parsed: ParsedRow[] = lines.slice(1).filter(r => r.some(c => c)).map(r => {
          const row: ParsedRow = {
            style_ref:      get(r, 'style_ref').trim(),
            client_name:    get(r, 'client_name').trim(),
            po_number:      get(r, 'po_number').trim(),
            etd:            get(r, 'etd').trim(),
            rate_per_piece: parseFloat(get(r, 'rate_per_piece')) || 0,
            currency:       get(r, 'currency').trim().toUpperCase() || 'INR',
            commission_pct: parseFloat(get(r, 'commission_pct')) || 0,
            quantity:       parseFloat(get(r, 'quantity')) || 0,
          }
          const errs: string[] = []
          if (!row.quantity)       errs.push('Quantity missing')
          if (!row.rate_per_piece) errs.push('Price missing')
          if (errs.length) row.error = errs.join('; ')
          return row
        })

        setRows(parsed)
        setStep('preview')
      } catch {
        setError('Could not parse file — download the template and check your format.')
      }
    }
    reader.readAsText(file)
  }

  const valid   = rows.filter(r => !r.error)
  const invalid = rows.filter(r => r.error)

  const handleImport = async () => {
    if (!commissionCustomer || !valid.length) return
    setSaving(true); setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    // Fetch market exchange rates for any foreign currencies in the file
    const foreignCurrencies = [...new Set(valid.filter(r => r.currency !== 'INR').map(r => r.currency))]
    let rates: Record<string, number> = {}
    if (foreignCurrencies.length > 0) {
      try {
        const res  = await fetch('/api/exchange-rates')
        const json = await res.json()
        rates = json.rates ?? {}
      } catch {}
    }

    // Group rows into orders by (PO number + client_name) — same PO = same order
    const orderMap = new Map<string, ParsedRow[]>()
    for (const row of valid) {
      const key = `${row.po_number.toLowerCase()}|${row.client_name.toLowerCase()}`
      if (!orderMap.has(key)) orderMap.set(key, [])
      orderMap.get(key)!.push(row)
    }

    const createdOrders: CommissionOrder[] = []

    for (const [, styleRows] of orderMap) {
      const first    = styleRows[0]
      const currency = first.currency
      const rate     = currency !== 'INR' ? (rates[currency] ?? null) : null

      // Create the order
      const { data: order, error: oErr } = await supabase
        .from('commission_orders')
        .insert({
          user_id:      user!.id,
          customer_id:  commissionCustomer.id,
          account_id:   accounts[0]?.id ?? null,
          order_number: first.po_number || null,
          order_date:   getTodayString(),
          payment_term: 'net_30',
          currency,
          exchange_rate: rate,
          client_name:  first.client_name || null,
        })
        .select('id')
        .single()

      if (oErr) { setError(oErr.message); setSaving(false); return }

      // Create style lines
      const stylePayloads = styleRows.map(s => {
        const total = s.quantity * s.rate_per_piece
        const comm  = total * (s.commission_pct / 100)
        const inr   = currency === 'INR' ? comm : (rate ? comm * rate : comm)
        return {
          order_id:             order.id,
          user_id:              user!.id,
          style_ref:            s.style_ref || null,
          quantity:             s.quantity,
          rate_per_piece:       s.rate_per_piece,
          total_value:          total,
          commission_type:      'percentage',
          commission_percentage: s.commission_pct,
          commission_amount:    comm,
          commission_inr:       inr,
          order_status:         'current',
          etd:                  s.etd || null,
        }
      })

      await supabase.from('commission_styles').insert(stylePayloads)

      // Fetch full order with styles
      const { data: full } = await supabase
        .from('commission_orders')
        .select('*, customer:customers(*), account:accounts(id,name), styles:commission_styles(*)')
        .eq('id', order.id)
        .single()

      if (full) createdOrders.push(full)
    }

    setStep('done')
    setTimeout(() => onImported(createdOrders), 1200)
  }

  const iStyle = { backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
         style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-full md:max-w-lg rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col slide-up"
           style={{ backgroundColor: 'var(--surface)', maxHeight: '100%' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>Import from CSV</h2>
            {/* Step breadcrumb */}
            <div className="flex items-center gap-1 mt-0.5">
              {['pick-customer','pick-file','preview'].map((s, i) => (
                <span key={s} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="w-3 h-3" style={{ color: 'var(--text-faint)' }} />}
                  <span className={`text-xs ${step === s ? 'font-semibold' : ''}`}
                    style={{ color: step === s ? 'var(--brand)' : 'var(--text-faint)' }}>
                    {i === 0 ? 'Customer' : i === 1 ? 'File' : 'Preview'}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl"
            style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4" style={{ overscrollBehavior: 'contain' }}>

          {/* ── Step 1: Pick commission customer ── */}
          {step === 'pick-customer' && (
            <>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Which customer pays you commission for this file?
              </p>
              {customers.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    No customers marked as "pays commission" yet.
                  </p>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-faint)' }}>
                    Go to Customers → edit a customer → enable the toggle.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {customers.map(c => (
                    <button key={c.id} onClick={() => { setCommissionCustomer(c); setStep('pick-file') }}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition-all"
                      style={{
                        borderColor: commissionCustomer?.id === c.id ? 'var(--brand)' : 'var(--border)',
                        background: commissionCustomer?.id === c.id ? 'var(--brand-light)' : 'var(--surface-2)',
                      }}>
                      <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{c.name}</span>
                      <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── Step 2: Upload file ── */}
          {step === 'pick-file' && (
            <>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                   style={{ background: 'var(--brand-light)' }}>
                <span className="text-xs font-medium" style={{ color: 'var(--brand)' }}>
                  Customer: {commissionCustomer?.name}
                </span>
                <button onClick={() => setStep('pick-customer')}
                  className="text-xs ml-auto" style={{ color: 'var(--brand)' }}>Change</button>
              </div>

              <button onClick={downloadTemplate}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface-2)' }}>
                <Download className="w-4 h-4" /> Download CSV template
              </button>

              <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                Columns: <code>style number, customer, PO number, ETD, price, currency, commission percentage, quantity</code>.
                The "customer" column is the buyer/client (e.g. H&amp;M, Zara) — rows with the same PO number are grouped into one order.
              </p>

              <div
                onClick={() => fileRef.current?.click()}
                {...csvDrop.dropProps}
                className="border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all"
                style={{ borderColor: csvDrop.dragOver ? 'var(--brand)' : 'var(--border)', background: csvDrop.dragOver ? 'var(--brand-light)' : undefined, color: csvDrop.dragOver ? 'var(--brand)' : 'var(--text-muted)' }}>
                <Upload className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">{csvDrop.dragOver ? 'Drop CSV to import' : 'Click or drag CSV here'}</p>
                <input ref={fileRef} type="file" accept=".csv,.CSV" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
              </div>

              {error && (
                <div className="flex items-center gap-2   text-sm rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}
            </>
          )}

          {/* ── Step 3: Preview ── */}
          {step === 'preview' && (
            <>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                   style={{ background: 'var(--brand-light)' }}>
                <span className="text-xs font-medium" style={{ color: 'var(--brand)' }}>
                  Customer: {commissionCustomer?.name}
                </span>
                <button onClick={() => setStep('pick-customer')}
                  className="text-xs ml-auto" style={{ color: 'var(--brand)' }}>Change</button>
              </div>

              {error && (
                <div className="flex items-center gap-2   text-sm rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}

              <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                {valid.length} valid style{valid.length !== 1 ? 's' : ''}
                {invalid.length > 0 && ` · ${invalid.length} with errors (will be skipped)`}
              </p>

              <div className="space-y-1 max-h-64 overflow-y-auto">
                {rows.map((r, i) => (
                  <div key={i}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-xs"
                    style={{ background: r.error ? 'color-mix(in srgb, var(--expense) 6%, transparent)' : 'var(--surface-2)' }}>
                    <div style={{ color: r.error ? 'var(--expense)' : 'var(--text)' }}>
                      <span className="font-mono">{r.style_ref || '—'}</span>
                      {r.client_name && <span className="ml-2" style={{ color: 'var(--text-muted)' }}>{r.client_name}</span>}
                      {r.po_number && <span className="ml-2" style={{ color: 'var(--text-muted)' }}>#{r.po_number}</span>}
                      <span className="ml-2">{r.quantity} pcs · {r.currency} {r.rate_per_piece} · {r.commission_pct}%</span>
                    </div>
                    {r.error
                      ? <span className=" ml-2 shrink-0">{r.error}</span>
                      : <CheckCircle2 className="w-3.5 h-3.5  shrink-0 ml-2" />}
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep('pick-file')}
                  className="flex-1 py-3 rounded-xl text-sm font-medium border"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  Change file
                </button>
                {valid.length > 0 && (
                  <button onClick={handleImport} disabled={saving}
                    className="flex-1 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                    style={{ background: 'var(--brand)' }}>
                    {saving ? 'Importing…' : `Import ${valid.length} style${valid.length !== 1 ? 's' : ''}`}
                  </button>
                )}
              </div>
            </>
          )}

          {/* ── Done ── */}
          {step === 'done' && (
            <div className="text-center py-10">
              <CheckCircle2 className="w-12 h-12  mx-auto mb-3" />
              <p className="font-semibold" style={{ color: 'var(--text)' }}>
                Imported {valid.length} style{valid.length !== 1 ? 's' : ''}
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                for {commissionCustomer?.name}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
