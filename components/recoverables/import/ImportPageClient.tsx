'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, CheckCircle, Loader2, AlertTriangle } from 'lucide-react'
import { useToast } from '@/components/shared/Toast'
import CSVDropzone from './CSVDropzone'
import SupplierColumnBadges from './SupplierColumnBadges'
import CSVPreviewTable from './CSVPreviewTable'
import ValidationErrors from './ValidationErrors'
import type { RawCSVRow, RowValidationError } from '@/lib/recoverables/types'

type Stage = 'idle' | 'previewing' | 'ready' | 'has_errors' | 'importing' | 'done'

interface PreviewData {
  isValid: boolean
  errors: RowValidationError[]
  rows: RawCSVRow[]
  supplierColumns: string[]
  summary: {
    referenceCount: number
    supplierCount: number
    totalCost: number
    totalRecoverable: number
  } | null
}

export default function ImportPageClient({ onImported }: { onImported?: () => void } = {}) {
  const router = useRouter()
  const { showToast } = useToast()

  const [stage, setStage] = useState<Stage>('idle')
  const [file, setFile]   = useState<File | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [unmatchedCustomers, setUnmatchedCustomers] = useState<string[]>([])
  const [apiError, setApiError] = useState<string | null>(null)

  // Form fields
  const [batchName, setBatchName] = useState('')
  const [source, setSource]       = useState('')
  const [currency, setCurrency]   = useState('INR')
  const [importDate, setImportDate] = useState(() => new Date().toISOString().slice(0, 10))

  const handleFileSelect = async (f: File) => {
    setFile(f)
    setApiError(null)
    if (!batchName) setBatchName(f.name.replace(/\.csv$/i, ''))
    setStage('previewing')

    const fd = new FormData()
    fd.append('file', f)
    fd.append('name', batchName || f.name)
    fd.append('source', source)
    fd.append('currency', currency)
    fd.append('importDate', importDate)
    fd.append('preview', 'true')

    try {
      const res = await fetch('/api/recoverables/import', { method: 'POST', body: fd })
      const data = await res.json() as PreviewData
      setPreview(data)
      setStage(data.isValid ? 'ready' : 'has_errors')
    } catch {
      showToast('Failed to analyse CSV. Please try again.', 'error')
      setApiError('Failed to analyse CSV. Please try again.')
      setStage('idle')
    }
  }

  const handleImport = async () => {
    if (!file) return
    setStage('importing')
    setApiError(null)

    const fd = new FormData()
    fd.append('file', file)
    fd.append('name', batchName)
    fd.append('source', source)
    fd.append('currency', currency)
    fd.append('importDate', importDate)
    fd.append('preview', 'false')

    try {
      const res = await fetch('/api/recoverables/import', { method: 'POST', body: fd })
      const data = await res.json() as { success?: boolean; batchId?: string; error?: string; unmatchedCustomers?: string[] }
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Import failed')
      setBatchId(data.batchId ?? null)
      setUnmatchedCustomers(data.unmatchedCustomers ?? [])
      setStage('done')
      showToast('Import complete', 'success')
      onImported?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed'
      showToast(msg, 'error')
      setApiError(msg)
      setStage('ready')
    }
  }

  const handleCancel = () => {
    setFile(null)
    setPreview(null)
    setBatchId(null)
    setApiError(null)
    setStage('idle')
  }

  return (
    <div className="page-enter w-full px-4 md:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors"
          style={{ color: 'var(--text-muted)', backgroundColor: 'var(--surface-2)' }}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Import CSV</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Upload a courier shipment CSV to create allocations</p>
        </div>
      </div>

      {/* Done state */}
      {stage === 'done' && (
        <div className="space-y-4">
          <div className="card text-center py-10 space-y-4">
            <CheckCircle className="w-12 h-12 mx-auto" style={{ color: 'var(--income, var(--income))' }} />
            <div>
              <p className="font-semibold text-lg" style={{ color: 'var(--text)' }}>Import complete</p>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                {preview?.summary?.referenceCount} references across {preview?.summary?.supplierCount} customers
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              {batchId && (
                <button
                  onClick={() => router.push(`/recoverables/batches/${batchId}`)}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white"
                  style={{ backgroundColor: 'var(--brand)' }}
                >
                  View Batch
                </button>
              )}
              <button
                onClick={() => router.push('/recoverables')}
                className="px-5 py-2.5 rounded-xl text-sm font-medium border"
                style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
              >
                Back to Dashboard
              </button>
            </div>
          </div>

          {unmatchedCustomers.length > 0 && (
            <div
              className="card flex items-start gap-3 p-4"
              style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a' }}
            >
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: 'var(--amber)' }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--amber)' }}>
                  {unmatchedCustomers.length} customer column{unmatchedCustomers.length > 1 ? 's' : ''} not matched
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--amber)' }}>
                  {unmatchedCustomers.join(', ')}. Add them in Customers and set their CSV Alias to match.
                </p>
                <Link
                  href="/customers"
                  className="inline-block mt-2 text-xs font-semibold underline"
                  style={{ color: 'var(--amber)' }}
                >
                  Go to Customers →
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Main flow */}
      {stage !== 'done' && (
        <>
          {/* Batch metadata fields */}
          <div className="card space-y-4">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Batch details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                  Batch name <span style={{ color: 'var(--expense)' }}>*</span>
                </label>
                <input
                  type="text"
                  value={batchName}
                  onChange={e => setBatchName(e.target.value)}
                  placeholder="e.g. DHL May Week 2"
                  className="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', color: 'var(--text)' }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Source (optional)</label>
                <input
                  type="text"
                  value={source}
                  onChange={e => setSource(e.target.value)}
                  placeholder="e.g. DHL, FedEx"
                  className="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', color: 'var(--text)' }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Currency</label>
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', color: 'var(--text)' }}
                >
                  <option value="INR">INR — Indian Rupee</option>
                  <option value="USD">USD — US Dollar</option>
                  <option value="EUR">EUR — Euro</option>
                  <option value="AED">AED — UAE Dirham</option>
                  <option value="GBP">GBP — British Pound</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Import date</label>
                <input
                  type="date"
                  value={importDate}
                  onChange={e => setImportDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                  style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface-2)', color: 'var(--text)' }}
                />
              </div>
            </div>
          </div>

          {/* Dropzone */}
          {(stage === 'idle' || stage === 'previewing') && (
            <CSVDropzone
              onFileSelect={handleFileSelect}
              isLoading={stage === 'previewing'}
            />
          )}

          {/* API error */}
          {apiError && (
            <p className="text-sm text-center" style={{ color: 'var(--expense)' }}>{apiError}</p>
          )}

          {/* Preview results */}
          {preview && (stage === 'ready' || stage === 'has_errors' || stage === 'importing') && (
            <div className="space-y-4">
              {/* Supplier badges */}
              <SupplierColumnBadges suppliers={preview.supplierColumns} />

              {/* Validation errors */}
              {preview.errors.length > 0 && (
                <ValidationErrors errors={preview.errors} maxShow={5} />
              )}

              {/* Summary stats (valid only) */}
              {preview.isValid && preview.summary && (
                <div
                  className="rounded-xl p-4 grid grid-cols-3 gap-4 text-center"
                  style={{ backgroundColor: 'var(--brand-light)' }}
                >
                  <div>
                    <p className="text-lg font-bold" style={{ color: 'var(--brand)' }}>
                      {preview.summary.referenceCount}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>References</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold" style={{ color: 'var(--brand)' }}>
                      {preview.summary.supplierCount}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Customers</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold" style={{ color: 'var(--brand)' }}>
                      ₹{preview.summary.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Cost</p>
                  </div>
                </div>
              )}

              {/* Preview table */}
              <CSVPreviewTable
                rows={preview.rows}
                supplierColumns={preview.supplierColumns}
                errors={preview.errors}
              />

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                {preview.isValid ? (
                  <button
                    onClick={handleImport}
                    disabled={stage === 'importing' || !batchName.trim()}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all"
                    style={{ backgroundColor: 'var(--brand)', opacity: (stage === 'importing' || !batchName.trim()) ? 0.6 : 1 }}
                  >
                    {stage === 'importing' ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</>
                    ) : (
                      'Import'
                    )}
                  </button>
                ) : (
                  <button
                    disabled
                    className="flex-1 py-3 rounded-xl text-sm font-semibold text-white"
                    style={{ backgroundColor: 'var(--text-faint)', cursor: 'not-allowed' }}
                  >
                    Fix your CSV and re-upload
                  </button>
                )}
                <button
                  onClick={handleCancel}
                  disabled={stage === 'importing'}
                  className="flex-1 py-3 rounded-xl text-sm font-medium border transition-all"
                  style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
