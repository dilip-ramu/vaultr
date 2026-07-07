'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, Upload, AlertTriangle, CheckCircle2, Loader2, FileText } from 'lucide-react'
import { notify } from '@/components/shared/Toast'

interface PreviewRow { date: string; description: string; amount: number; type: 'income' | 'expense' }
interface PreviewResponse {
  preview: true
  total: number
  keptCount: number
  skipped: number
  sample: PreviewRow[]
  warnings: string[]
  cutoff: string | null
}

interface Props {
  accountId: string
  accountName: string
  /** Earliest existing transaction date on this account — used to default the
   *  cutoff so we don't re-import the time window the user has already keyed in. */
  earliestExistingDate: string | null
  onClose: () => void
}

function defaultCutoff(earliest: string | null): string {
  // Default to the earliest existing transaction date itself (rows strictly
  // before it are kept). If there are no existing transactions, leave blank.
  return earliest ?? ''
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n)
}

export default function ImportStatementModal({ accountId, accountName, earliestExistingDate, onClose }: Props) {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [cutoff, setCutoff] = useState(defaultCutoff(earliestExistingDate))
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [stage, setStage] = useState<'idle' | 'previewing' | 'previewed' | 'importing' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null)

  // Re-run preview when cutoff changes (debounced lightly)
  useEffect(() => {
    if (!file || stage === 'importing' || stage === 'done') return
    const t = setTimeout(() => { void runPreview() }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutoff])

  async function runPreview(f: File | null = file) {
    if (!f) return
    setStage('previewing'); setError(null)
    const fd = new FormData()
    fd.append('file', f)
    fd.append('preview', 'true')
    if (cutoff) fd.append('cutoff', cutoff)
    try {
      const res = await fetch(`/api/accounts/${accountId}/import-statement`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not parse the file'); setStage('idle'); return }
      setPreview(data as PreviewResponse)
      setStage('previewed')
    } catch {
      setError('Network error. Try again.')
      setStage('idle')
    }
  }

  async function runImport() {
    if (!file) return
    setStage('importing'); setError(null)
    const fd = new FormData()
    fd.append('file', file)
    if (cutoff) fd.append('cutoff', cutoff)
    try {
      const res = await fetch(`/api/accounts/${accountId}/import-statement`, { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Import failed'); setStage('previewed'); return }
      setResult({ inserted: data.inserted, skipped: data.skipped })
      setStage('done')
      notify(`Imported ${data.inserted} transactions`, 'success')
      router.refresh()
    } catch {
      setError('Network error during import.')
      setStage('previewed')
    }
  }

  function handleFile(f: File) {
    setFile(f)
    setPreview(null)
    setResult(null)
    void runPreview(f)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
      <div className="w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl shadow-xl flex flex-col max-h-[92dvh]" style={{ background: 'var(--surface)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Import past statement</h2>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{accountName}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {stage !== 'done' && (
            <>
              {/* File picker */}
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>CSV statement</span>
                <div className="relative mt-2 flex items-center gap-3 rounded-xl border-2 border-dashed p-4 cursor-pointer" style={{ borderColor: 'var(--border)', background: 'var(--surface-2)' }}>
                  <FileText className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                      {file ? file.name : 'Tap to choose a CSV file'}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--text-faint)' }}>
                      Needs columns for Date and Amount (or Debit/Credit). Most bank exports work as-is.
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                  />
                </div>
              </label>

              {/* Cutoff date */}
              <div>
                <span className="text-xs font-medium uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Stop importing on or after</span>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="date"
                    value={cutoff}
                    onChange={e => setCutoff(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none"
                    style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
                  />
                  {earliestExistingDate && cutoff !== earliestExistingDate && (
                    <button onClick={() => setCutoff(earliestExistingDate)} className="text-xs px-2 py-1 rounded-lg" style={{ color: 'var(--brand)', background: 'rgba(42,122,80,0.08)' }}>
                      Use {earliestExistingDate}
                    </button>
                  )}
                </div>
                <p className="text-xs mt-1.5" style={{ color: 'var(--text-faint)' }}>
                  {earliestExistingDate
                    ? `Your earliest existing transaction is ${earliestExistingDate}. Rows on or after this date are skipped so you don't double up.`
                    : 'No existing transactions on this account — leave blank to import everything.'}
                </p>
              </div>

              {/* Errors / warnings */}
              {error && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-sm" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--expense)' }}>
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Preview */}
              {preview && stage !== 'previewing' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>To import</p>
                      <p className="text-lg font-bold" style={{ color: 'var(--text)' }}>{preview.keptCount}</p>
                    </div>
                    {preview.skipped > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>Skipped (after cutoff)</p>
                        <p className="text-lg font-bold" style={{ color: 'var(--text-muted)' }}>{preview.skipped}</p>
                      </div>
                    )}
                  </div>

                  {preview.warnings.length > 0 && (
                    <div className="text-xs space-y-1" style={{ color: 'var(--text-muted)' }}>
                      {preview.warnings.map((w, i) => <p key={i}>· {w}</p>)}
                    </div>
                  )}

                  {preview.sample.length > 0 && (
                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                      <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                        First {Math.min(preview.sample.length, preview.keptCount)} rows
                      </div>
                      <div className="max-h-48 overflow-y-auto divide-y" style={{ borderColor: 'var(--border)' }}>
                        {preview.sample.map((r, i) => (
                          <div key={i} className="px-3 py-2 flex items-center justify-between text-xs gap-2">
                            <span style={{ color: 'var(--text-muted)' }}>{r.date}</span>
                            <span className="flex-1 truncate" style={{ color: 'var(--text)' }} title={r.description}>{r.description}</span>
                            <span className="tabular-nums font-medium shrink-0" style={{ color: r.type === 'income' ? 'var(--income)' : 'var(--expense)' }}>
                              {r.type === 'income' ? '+' : '−'}₹{fmt(r.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {stage === 'previewing' && (
                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                  <Loader2 className="w-4 h-4 animate-spin" /> Reading file…
                </div>
              )}
            </>
          )}

          {/* Done */}
          {stage === 'done' && result && (
            <div className="space-y-3 text-center py-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto" style={{ background: 'rgba(34,197,94,0.1)' }}>
                <CheckCircle2 className="w-7 h-7" style={{ color: 'var(--income)' }} />
              </div>
              <div>
                <p className="text-base font-semibold" style={{ color: 'var(--text)' }}>Imported {result.inserted} transactions</p>
                {result.skipped > 0 && (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Skipped {result.skipped} rows on or after the cutoff.</p>
                )}
              </div>
              <p className="text-xs px-4" style={{ color: 'var(--text-faint)' }}>
                Want the running balance to line up? Open this account, edit it, and tweak the &quot;Initial balance&quot; — the statement view will recompute.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex items-center justify-end gap-2 shrink-0" style={{ borderColor: 'var(--border)' }}>
          {stage === 'done' ? (
            <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: 'var(--brand)' }}>Done</button>
          ) : (
            <>
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>Cancel</button>
              <button
                onClick={runImport}
                disabled={!preview || preview.keptCount === 0 || stage === 'importing'}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center gap-1.5"
                style={{ background: 'var(--brand)' }}
              >
                {stage === 'importing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {stage === 'importing' ? 'Importing…' : `Import ${preview?.keptCount ?? 0}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
