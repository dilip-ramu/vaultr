'use client'

import { useMemo, useRef, useState } from 'react'
import { X, Upload, FileSpreadsheet, Download, ArrowLeft, ArrowRight, Check, Loader2, AlertTriangle } from 'lucide-react'
import { notify } from '@/components/shared/Toast'
import { MEMBER_COLUMNS, sampleMemberCsv, type ParsedMemberRow } from '@/lib/chit/memberCsv'
import {
  detectHeaderRow, bestSheet, headerLabels, guessMapping, sampleValues, cellToText,
  missingRequired, applyMapping, tally, type ColumnMapping,
} from '@/lib/chit/importSheet'

/** More than this and the browser is doing somebody's database a favour. */
const MAX_ROWS = 5000
/** How many rows of the file the header picker offers. */
const HEADER_CHOICES = 8

export interface ImportOutcome {
  summary: string
  notes?: string[]
}

interface Props {
  title: string
  /** One line under the title saying what this import does. */
  intro: string
  /** Shown on the review step — e.g. how many seats are left in a chit. */
  reviewNote?: (rows: ParsedMemberRow[]) => string | null
  /** Does the work. The wizard has already mapped and checked the rows. */
  onConfirm: (rows: ParsedMemberRow[]) => Promise<ImportOutcome>
  onClose: () => void
  /** Called after a successful import, once the result has been read. */
  onDone: () => void
}

type Step = 'file' | 'map' | 'review' | 'done'

export default function SheetImport({ title, intro, reviewNote, onConfirm, onClose, onDone }: Props) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('file')
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState('')
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [sheetIndex, setSheetIndex] = useState(0)
  const [grids, setGrids] = useState<string[][][]>([])
  const [headerRow, setHeaderRow] = useState(0)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [result, setResult] = useState<ImportOutcome | null>(null)
  const [dragging, setDragging] = useState(false)

  const grid = grids[sheetIndex] ?? []
  const headers = useMemo(() => headerLabels(grid, headerRow), [grid, headerRow])
  const rows = useMemo(() => applyMapping(grid, headerRow, mapping), [grid, headerRow, mapping])
  const counts = useMemo(() => tally(rows), [rows])
  const missing = useMemo(() => missingRequired(mapping), [mapping])

  // ── Step 1: read the file ─────────────────────────────────────────────────
  async function readFile(file: File) {
    setBusy(true)
    try {
      // SheetJS reads .xlsx, .xls AND .csv, so there is one path for all three
      // and no second CSV parser to disagree with the first.
      const XLSX = await import('xlsx')
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true })
      if (!wb.SheetNames.length) { notify('That file has no sheets in it', 'error'); return }

      const parsed = wb.SheetNames.map(n => {
        // raw:true, then converted by hand — see cellToText. Asking the
        // spreadsheet for its DISPLAYED text turns a long account number
        // into "5.01001E+13".
        const g = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], {
          header: 1, blankrows: true, raw: true, defval: null,
        }) as unknown[][]
        return g.slice(0, MAX_ROWS + 50).map(r => (r ?? []).map(cellToText))
      })

      // Open on the sheet that looks like a member list, not the first one
      // with anything in it — a workbook often leads with a cover sheet.
      const firstUseful = bestSheet(parsed)
      const g = parsed[firstUseful] ?? []
      const hr = detectHeaderRow(g)

      setFileName(file.name)
      setSheetNames(wb.SheetNames)
      setGrids(parsed)
      setSheetIndex(firstUseful)
      setHeaderRow(hr)
      setMapping(guessMapping(headerLabels(g, hr)))
      setStep('map')
    } catch {
      notify('Could not read that file. Save it as .xlsx or .csv and try again.', 'error')
    } finally { setBusy(false) }
  }

  function pickSheet(i: number) {
    const g = grids[i] ?? []
    const hr = detectHeaderRow(g)
    setSheetIndex(i)
    setHeaderRow(hr)
    setMapping(guessMapping(headerLabels(g, hr)))
  }

  function pickHeaderRow(i: number) {
    setHeaderRow(i)
    setMapping(guessMapping(headerLabels(grid, i)))
  }

  function downloadSample() {
    const blob = new Blob([sampleMemberCsv()], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'chit-members-example.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function runImport() {
    setBusy(true)
    try {
      const outcome = await onConfirm(rows.filter(r => !r.error))
      setResult(outcome)
      setStep('done')
    } catch (e) {
      notify(e instanceof Error ? e.message : 'The import did not finish', 'error')
    } finally { setBusy(false) }
  }

  const sel = 'px-2 py-1.5 rounded-lg border text-sm'
  const selStyle = { background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }

  return (
    <div className="fixed inset-0 z-[80] flex items-end md:items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full md:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-3xl md:rounded-2xl shadow-xl slide-up" style={{ background: 'var(--surface)' }}>

        {/* Header + where you are */}
        <div className="sticky top-0 z-10 px-6 pt-5 pb-3" style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-extrabold" style={{ color: 'var(--text)' }}>{title}</p>
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{intro}</p>
            </div>
            <button onClick={onClose} style={{ color: 'var(--text-faint)' }} aria-label="Close"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex items-center gap-1.5 mt-3">
            {(['file', 'map', 'review'] as const).map((s, i) => {
              const order = ['file', 'map', 'review', 'done']
              const at = order.indexOf(step)
              const done = at > i
              const here = step === s
              return (
                <div key={s} className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={done ? { background: 'var(--income)', color: '#fff' }
                      : here ? { background: 'var(--brand)', color: '#fff' }
                      : { background: 'var(--surface-2)', color: 'var(--text-faint)' }}>
                    {done ? <Check className="w-3 h-3" /> : i + 1}
                  </span>
                  <span className="text-[11px] font-bold" style={{ color: here ? 'var(--text)' : 'var(--text-muted)' }}>
                    {s === 'file' ? 'File' : s === 'map' ? 'Match columns' : 'Check'}
                  </span>
                  {i < 2 && <span className="w-4 h-px" style={{ background: 'var(--border)' }} />}
                </div>
              )
            })}
          </div>
        </div>

        <div className="p-6">
          {/* ── 1. File ───────────────────────────────────────────────────── */}
          {step === 'file' && (
            <>
              <label
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) readFile(f) }}
                className="block w-full text-center py-12 rounded-xl cursor-pointer transition-colors"
                style={{ border: `1px dashed ${dragging ? 'var(--brand)' : 'var(--border)'}`, background: dragging ? 'var(--brand-light)' : 'transparent', color: 'var(--text-muted)' }}>
                {busy ? <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" /> : <FileSpreadsheet className="w-6 h-6 mx-auto mb-2" />}
                <span className="block text-[14px] font-bold" style={{ color: 'var(--text)' }}>
                  {busy ? 'Reading…' : 'Drop a file here, or click to choose'}
                </span>
                <span className="block text-[12px] mt-1">Excel (.xlsx, .xls) or CSV. Any column names — you match them next.</span>
                <input ref={fileInput} type="file" className="hidden" disabled={busy}
                  accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={e => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = '' }} />
              </label>

              <button onClick={downloadSample}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-bold mt-3"
                style={{ border: '1px solid var(--border)', color: 'var(--brand)' }}>
                <Download className="w-4 h-4" /> Download an example file
              </button>
              <p className="text-[11.5px] mt-2" style={{ color: 'var(--text-faint)' }}>
                You do not need the example. It is only there if you would rather start from the right shape.
              </p>
            </>
          )}

          {/* ── 2. Match columns ──────────────────────────────────────────── */}
          {step === 'map' && (
            <>
              <div className="flex flex-wrap items-end gap-3 mb-4">
                <div className="text-[12px] flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                  <FileSpreadsheet className="w-3.5 h-3.5" /> {fileName}
                </div>
                {sheetNames.length > 1 && (
                  <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Sheet
                    <select value={sheetIndex} onChange={e => pickSheet(Number(e.target.value))} className={`${sel} block mt-1`} style={selStyle}>
                      {sheetNames.map((n, i) => <option key={n} value={i}>{n}</option>)}
                    </select>
                  </label>
                )}
                <label className="text-[11px] font-semibold" style={{ color: 'var(--text-muted)' }}>Headers are on row
                  <select value={headerRow} onChange={e => pickHeaderRow(Number(e.target.value))} className={`${sel} block mt-1`} style={selStyle}>
                    {Array.from({ length: Math.min(grid.length, HEADER_CHOICES) }, (_, i) => (
                      <option key={i} value={i}>
                        {i + 1} — {(grid[i] ?? []).filter(Boolean).slice(0, 4).join(', ').slice(0, 48) || 'empty'}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                <div className="grid grid-cols-[1fr_1fr_1.1fr] gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-wide"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                  <span>Field in Inex</span><span>Column in your file</span><span>What is in it</span>
                </div>
                {MEMBER_COLUMNS.map(col => {
                  const chosen = mapping[col.field] ?? null
                  const examples = sampleValues(grid, headerRow, chosen)
                  const required = col.field === 'name'
                  return (
                    <div key={col.field} className="grid grid-cols-[1fr_1fr_1.1fr] gap-2 items-center px-3 py-2" style={{ borderTop: '1px solid var(--border)' }}>
                      <span className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>
                        {col.header}
                        {required && <span className="ml-1 text-[10px] font-bold" style={{ color: 'var(--expense)' }}>required</span>}
                      </span>
                      <select
                        value={chosen === null ? '' : String(chosen)}
                        onChange={e => setMapping(m => ({ ...m, [col.field]: e.target.value === '' ? null : Number(e.target.value) }))}
                        className={sel} style={selStyle}>
                        <option value="">— don&apos;t import —</option>
                        {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                      </select>
                      <span className="text-[12px] truncate" style={{ color: examples.length ? 'var(--text-muted)' : 'var(--text-faint)' }}>
                        {examples.length ? examples.join(' · ') : chosen === null ? '—' : 'that column is empty'}
                      </span>
                    </div>
                  )
                })}
              </div>

              {missing.length > 0 && (
                <p className="flex items-center gap-1.5 text-[12px] mt-3" style={{ color: 'var(--expense)' }}>
                  <AlertTriangle className="w-3.5 h-3.5" /> Match a column to <b>{missing.join(', ')}</b> before going on.
                </p>
              )}

              <div className="flex items-center justify-between gap-3 mt-4">
                <button onClick={() => setStep('file')} className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: 'var(--text-muted)' }}>
                  <ArrowLeft className="w-4 h-4" /> Different file
                </button>
                <button onClick={() => setStep('review')} disabled={missing.length > 0 || counts.total === 0}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50"
                  style={{ background: 'var(--brand)' }}>
                  Check {counts.total} row{counts.total === 1 ? '' : 's'} <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {/* ── 3. Check ──────────────────────────────────────────────────── */}
          {step === 'review' && (
            <>
              <div className="flex flex-wrap gap-2 mb-3">
                <Pill label="Ready to import" value={counts.ready} tone="good" />
                {counts.problems > 0 && <Pill label="Will be skipped" value={counts.problems} tone="bad" />}
              </div>
              {reviewNote?.(rows.filter(r => !r.error)) && (
                <p className="text-[12.5px] mb-3" style={{ color: 'var(--text-muted)' }}>{reviewNote(rows.filter(r => !r.error))}</p>
              )}

              <div className="rounded-xl border overflow-x-auto max-h-80" style={{ borderColor: 'var(--border)' }}>
                <table className="w-full text-[12.5px]">
                  <thead><tr style={{ background: 'var(--surface-2)' }}>
                    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>Row</th>
                    {MEMBER_COLUMNS.filter(c => mapping[c.field] !== null && mapping[c.field] !== undefined).map(c => (
                      <th key={c.field} className="px-3 py-2 text-left text-[10px] font-bold uppercase whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{c.header}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {rows.slice(0, 50).map(r => (
                      <tr key={r.row} style={{ borderTop: '1px solid var(--border)', background: r.error ? '#FEE2E222' : undefined }}>
                        <td className="px-3 py-1.5 tabular-nums" style={{ color: r.error ? 'var(--expense)' : 'var(--text-faint)' }}>
                          {r.row}{r.error ? ' ⚠' : ''}
                        </td>
                        {MEMBER_COLUMNS.filter(c => mapping[c.field] !== null && mapping[c.field] !== undefined).map(c => (
                          <td key={c.field} className="px-3 py-1.5 whitespace-nowrap max-w-[14rem] truncate" style={{ color: 'var(--text)' }}>
                            {r.values[c.field] ?? ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 50 && <p className="text-[11.5px] mt-1.5" style={{ color: 'var(--text-faint)' }}>Showing the first 50 of {rows.length}.</p>}
              {counts.problems > 0 && (
                <p className="text-[12px] mt-2" style={{ color: 'var(--text-muted)' }}>
                  The {counts.problems} marked ⚠ have no name and will be left out. Everything else goes in.
                </p>
              )}

              <div className="flex items-center justify-between gap-3 mt-4">
                <button onClick={() => setStep('map')} className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: 'var(--text-muted)' }}>
                  <ArrowLeft className="w-4 h-4" /> Change the matching
                </button>
                <button onClick={runImport} disabled={busy || counts.ready === 0}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-50"
                  style={{ background: 'var(--brand)' }}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {busy ? 'Importing…' : `Import ${counts.ready}`}
                </button>
              </div>
            </>
          )}

          {/* ── 4. Done ───────────────────────────────────────────────────── */}
          {step === 'done' && result && (
            <>
              <p className="text-[15px] font-extrabold" style={{ color: 'var(--brand)' }}>{result.summary}</p>
              {result.notes && result.notes.length > 0 && (
                <div className="mt-3 space-y-0.5 max-h-60 overflow-y-auto">
                  {result.notes.map((n, i) => (
                    <p key={i} className="text-[11.5px]" style={{ color: n.includes('already') ? 'var(--text-muted)' : 'var(--expense)' }}>{n}</p>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-end gap-3 mt-5">
                <button onClick={() => { setStep('file'); setResult(null); setGrids([]) }} className="text-[13px] font-bold" style={{ color: 'var(--text-muted)' }}>
                  Import another file
                </button>
                <button onClick={onDone} className="px-4 py-2.5 rounded-xl text-white text-sm font-bold" style={{ background: 'var(--brand)' }}>Done</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Pill({ label, value, tone }: { label: string; value: number; tone: 'good' | 'bad' }) {
  const c = tone === 'good' ? { bg: '#DCFCE7', fg: '#14532D' } : { bg: '#FEE2E2', fg: '#991B1B' }
  return (
    <span className="text-[12px] font-bold px-2.5 py-1 rounded-lg" style={{ background: c.bg, color: c.fg }}>
      {value} {label}
    </span>
  )
}
