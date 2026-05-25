'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, Upload, FileText, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { CourierProvider } from '@/lib/logistics/types'
import type { Account } from '@/lib/types'
import CourierProviderBadge from '../shared/CourierProviderBadge'

const PROVIDERS: CourierProvider[] = ['DHL', 'FedEx', 'Aramex', 'UPS', 'custom']
const CURRENCIES = ['INR', 'USD', 'EUR', 'AED', 'GBP']

interface Props {
  mode: 'create'
  accounts: Account[]
}

export default function CourierInvoiceForm({ mode, accounts }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [provider, setProvider] = useState<CourierProvider>('DHL')
  const [customProvider, setCustomProvider] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState('')
  const [currency, setCurrency] = useState('INR')
  const [subtotal, setSubtotal] = useState('')
  const [taxAmount, setTaxAmount] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [notes, setNotes] = useState('')

  // File upload
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  // Auto-calculate total
  useEffect(() => {
    const sub = parseFloat(subtotal) || 0
    const tax = parseFloat(taxAmount) || 0
    if (sub > 0 || tax > 0) setTotalAmount(String(Math.round((sub + tax) * 100) / 100))
  }, [subtotal, taxAmount])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel']
    if (!allowed.includes(f.type) && !f.name.match(/\.(pdf|xlsx|xls)$/i)) {
      setError('Only PDF and Excel files are supported')
      return
    }
    setFile(f)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!invoiceNumber.trim() || !invoiceDate) { setError('Invoice number and date are required'); return }

    setSaving(true)
    setError('')

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const effectiveProvider = provider === 'custom' ? (customProvider.trim() || 'custom') : provider

      // Upload file if selected
      let filePath: string | null = null
      let fileName: string | null = null
      let fileType: string | null = null

      if (file) {
        setUploading(true)
        const ext = file.name.split('.').pop()?.toLowerCase()
        fileType = ext === 'pdf' ? 'pdf' : 'excel'
        fileName = file.name
        filePath = `logistics/courier-invoices/${user.id}/${Date.now()}-${file.name}`

        const { error: uploadError } = await supabase.storage
          .from('vaultr-attachments')
          .upload(filePath, file, { upsert: false })

        if (uploadError) throw new Error(`File upload failed: ${uploadError.message}`)
        setUploadProgress(100)
        setUploading(false)
      }

      const { data: invoice, error: insertError } = await supabase
        .from('courier_invoices')
        .insert({
          user_id: user.id,
          courier_provider: effectiveProvider,
          invoice_number: invoiceNumber.trim(),
          invoice_date: invoiceDate,
          due_date: dueDate || null,
          currency,
          subtotal: parseFloat(subtotal) || 0,
          tax_amount: parseFloat(taxAmount) || 0,
          total_amount: parseFloat(totalAmount) || 0,
          account_id: accountId || null,
          file_path: filePath,
          file_name: fileName,
          file_type: fileType,
          notes: notes.trim() || null,
        })
        .select()
        .single()

      if (insertError) throw new Error(insertError.message)

      // OCR pipeline hook — uncomment when pipeline is ready:
      // if (filePath && fileType) {
      //   const { createOCRPipeline } = await import('@/lib/logistics/ocr/pipeline')
      //   const pipeline = createOCRPipeline(supabase)
      //   await pipeline.processFile({
      //     courierInvoiceId: invoice.id,
      //     filePath,
      //     fileType: fileType as 'pdf' | 'excel',
      //     provider: effectiveProvider,
      //   })
      // }

      router.push(`/logistics/courier-invoices/${invoice.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSaving(false)
      setUploading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} style={{ color: 'var(--text-muted)' }}>
          <X className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>
          New Courier Invoice
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="px-4 py-3 rounded-xl text-sm font-medium" style={{ backgroundColor: 'var(--expense)', color: '#fff', opacity: 0.9 }}>
            {error}
          </div>
        )}

        {/* Courier Provider */}
        <div className="card p-4 space-y-3">
          <label className="text-label" style={{ color: 'var(--text-muted)' }}>Courier Provider</label>
          <div className="flex flex-wrap gap-2">
            {PROVIDERS.map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setProvider(p)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  backgroundColor: provider === p ? 'var(--brand)' : 'var(--surface-2)',
                  color: provider === p ? '#fff' : 'var(--text-muted)',
                  border: provider === p ? 'none' : '1px solid var(--border)',
                }}
              >
                {p === 'custom' ? 'Custom' : p}
              </button>
            ))}
          </div>
          {provider === 'custom' && (
            <input
              type="text"
              value={customProvider}
              onChange={e => setCustomProvider(e.target.value)}
              placeholder="Courier name (e.g. Blue Dart)"
              className="w-full px-3 py-2.5 rounded-xl text-sm border"
              style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
            />
          )}
        </div>

        {/* Invoice Details */}
        <div className="card p-4 space-y-4">
          <label className="text-label" style={{ color: 'var(--text-muted)' }}>Invoice Details</label>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Invoice Number *</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={e => setInvoiceNumber(e.target.value)}
                placeholder="e.g. 2025-001234"
                required
                className="w-full px-3 py-2.5 rounded-xl text-sm border"
                style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Invoice Date *</label>
              <input
                type="date"
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
                required
                className="w-full px-3 py-2.5 rounded-xl text-sm border"
                style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm border"
                style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Currency</label>
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm border"
              style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Amounts */}
        <div className="card p-4 space-y-4">
          <label className="text-label" style={{ color: 'var(--text-muted)' }}>Amounts</label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Subtotal', value: subtotal, set: setSubtotal },
              { label: 'Tax', value: taxAmount, set: setTaxAmount },
              { label: 'Total', value: totalAmount, set: setTotalAmount },
            ].map(({ label, value, set }) => (
              <div key={label}>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</label>
                <input
                  type="number"
                  value={value}
                  onChange={e => set(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  className="w-full px-3 py-2.5 rounded-xl text-sm border"
                  style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Payment Account */}
        {accounts.length > 0 && (
          <div className="card p-4 space-y-3">
            <label className="text-label" style={{ color: 'var(--text-muted)' }}>Payment Account</label>
            <select
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm border"
              style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              <option value="">— None —</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        {/* File Upload */}
        <div className="card p-4 space-y-3">
          <label className="text-label" style={{ color: 'var(--text-muted)' }}>Attach Invoice (PDF / Excel)</label>
          {file ? (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)' }}>
              <FileText className="w-4 h-4 shrink-0" style={{ color: 'var(--brand)' }} />
              <span className="flex-1 text-sm truncate" style={{ color: 'var(--text)' }}>{file.name}</span>
              {uploading
                ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--brand)' }} />
                : <button type="button" onClick={() => setFile(null)}><X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} /></button>
              }
            </div>
          ) : (
            <label
              className="flex flex-col items-center gap-2 px-4 py-5 rounded-xl border-2 border-dashed cursor-pointer transition-all"
              style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
            >
              <Upload className="w-5 h-5" />
              <span className="text-sm">Click to upload PDF or Excel</span>
              <input
                type="file"
                accept=".pdf,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>
          )}
          {uploadProgress > 0 && uploadProgress < 100 && (
            <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border)' }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${uploadProgress}%`, backgroundColor: 'var(--brand)' }} />
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="card p-4 space-y-3">
          <label className="text-label" style={{ color: 'var(--text-muted)' }}>Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Any notes about this invoice…"
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl text-sm border resize-none"
            style={{ backgroundColor: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2"
          style={{ backgroundColor: 'var(--brand)' }}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Saving…' : 'Create Invoice'}
        </button>
      </form>
    </div>
  )
}
