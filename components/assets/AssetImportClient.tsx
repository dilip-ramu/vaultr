'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileSpreadsheet, ArrowLeft, Check, Loader2, AlertTriangle } from 'lucide-react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'
import { useFileDrop } from '@/components/shared/useFileDrop'

// header prefix -> our key (case-insensitive startsWith on the header cell)
const COLS: Record<string, string> = {
  name: 'name', material: 'material', 'metal purity': 'purity', type: 'type',
  acquisition: 'date', gross: 'gross', net: 'net', 'metal cost': 'metalCost',
  'diamond (': 'diaCt', 'diamond cost': 'diaCost', 'diamond- value': 'diaPresent',
  'other stones cos': 'othCost', 'other stones': 'othCt', 'other stone- val': 'othPresent',
  'value addition': 'valueAdd', 'making': 'makingG', 'certification': 'cert',
  'discount': 'discount', 'tax rate': 'tax', 'status': 'status', 'source': 'source', 'remarks': 'remarks',
}
const numf = (v: unknown) => { if (v === null || v === undefined || v === '') return undefined; const n = Number(String(v).replace(/[^\d.\-]/g, '')); return isNaN(n) ? undefined : n }
function mapPurity(material?: string, purity?: string) {
  const mat = (material || '').toLowerCase(), p = purity || ''
  if (mat === 'silver' || /silver/i.test(p)) { const m = p.match(/[\d.]+/); return { category: 'silver', metal: 'silver', purity: (m ? m[0] : '92.5') + '%' } }
  const m = p.match(/(\d+(?:\.\d+)?)\s*K/i); return { category: 'gold', metal: 'gold', purity: (m ? m[1] : '22') + 'K' }
}
const subFromType = (t?: string) => /coin|bullion|bar/i.test(t || '') ? 'coins' : 'jewellery'
function dstr(v: unknown): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const m = String(v).match(/(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : null
}

interface Parsed { name: string; category: string; subcategory: string; metal: string; metal_purity: string; purchase_date: string | null; include: boolean; details: Record<string, unknown>; net?: number; raw: Record<string, unknown> }

export default function AssetImportClient() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<Parsed[]>([])
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState<{ ok: number; skip: number; fail: number; err?: string } | null>(null)
  const importDrop = useFileDrop(f => { if (f[0]) parseFile(f[0]) })

  const parseFile = async (file: File) => {
    setError(''); setRows([]); setDone(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false }) as unknown[][]
      // find header row (has "Name" and "Material")
      let hi = grid.findIndex(r => r.some(c => String(c).trim().toLowerCase() === 'name') && r.some(c => String(c).trim().toLowerCase() === 'material'))
      if (hi < 0) { setError('Could not find a header row with “Name” and “Material”.'); return }
      const headers = grid[hi].map(c => String(c ?? '').trim())
      const idx: Record<string, number> = {}
      for (const [prefix, key] of Object.entries(COLS)) {
        const i = headers.findIndex(h => h.toLowerCase().startsWith(prefix))
        if (i >= 0 && idx[key] === undefined) idx[key] = i
      }
      const g = (r: unknown[], k: string) => idx[k] === undefined ? undefined : r[idx[k]]
      const out: Parsed[] = []
      for (const r of grid.slice(hi + 1)) {
        const name = String(g(r, 'name') ?? '').trim()
        if (!name) continue
        const material = String(g(r, 'material') ?? '').trim()
        const purityRaw = String(g(r, 'purity') ?? '').trim()
        const { category, metal, purity } = mapPurity(material, purityRaw)
        const status = String(g(r, 'status') ?? '').trim().toLowerCase()
        const details: Record<string, unknown> = {
          import_name: name, import_src: 'monday/precious_metals', material, item_purity: purityRaw, purity,
          weight_g: numf(g(r, 'net')), gross_weight_g: numf(g(r, 'gross')), price_per_gram: numf(g(r, 'metalCost')),
          value_addition_pct: numf(g(r, 'valueAdd')), making_per_gram: numf(g(r, 'makingG')), certification: numf(g(r, 'cert')),
          discount: numf(g(r, 'discount')), tax_pct: numf(g(r, 'tax')),
          diamond_carats: numf(g(r, 'diaCt')), diamond_cost_per_carat: numf(g(r, 'diaCost')), diamond_present_per_carat: numf(g(r, 'diaPresent')),
          other_carats: numf(g(r, 'othCt')), other_cost_per_carat: numf(g(r, 'othCost')), other_present_per_carat: numf(g(r, 'othPresent')),
        }
        out.push({
          name, category, subcategory: subFromType(String(g(r, 'type') ?? '')), metal, metal_purity: purity,
          purchase_date: dstr(g(r, 'date')), include: !(status === 'sold' || status === 'gifted'),
          details, net: numf(g(r, 'net')),
          raw: { material, purity: purityRaw, status, remarks: g(r, 'remarks') },
        })
      }
      if (out.length === 0) setError('No rows with a Name were found.')
      setRows(out)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not read the file.') }
  }

  const runImport = async () => {
    setImporting(true); setProgress(0); setError('')
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not signed in.'); setImporting(false); return }
    // existing import names to skip
    const { data: existing, error: exErr } = await supabase.from('assets').select('details').eq('user_id', user.id)
    if (exErr) {
      const hint = /relation .*assets.* does not exist|could not find the table/i.test(exErr.message)
        ? 'The "assets" table does not exist yet — run migration v78 in Supabase (SQL editor), then try again.'
        : exErr.message
      setImporting(false); setDone({ ok: 0, skip: 0, fail: rows.length, err: hint }); return
    }
    const seen = new Set((existing ?? []).map(a => (a.details as { import_name?: string })?.import_name).filter(Boolean))
    let ok = 0, skip = 0, fail = 0, firstErr = ''
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (seen.has(r.name)) { skip++; setProgress(i + 1); continue }
      const { error: e } = await supabase.from('assets').insert({
        user_id: user.id, name: r.name, category: r.category, subcategory: r.subcategory,
        valuation_type: 'market', purchase_date: r.purchase_date, cost_total: 0, details: r.details,
        metal: r.metal, metal_purity: r.metal_purity, quantity_g: r.net ?? null,
        include_in_net_worth: r.include, photo_url: null, notes: (r.raw.remarks as string) || null,
      })
      if (e) { fail++; if (!firstErr) firstErr = e.message } else ok++
      setProgress(i + 1)
    }
    setImporting(false); setDone({ ok, skip, fail, err: firstErr || undefined })
  }

  const catCounts = rows.reduce<Record<string, number>>((m, r) => { m[r.category] = (m[r.category] ?? 0) + 1; return m }, {})

  return (
    <div className="w-full max-w-[820px] mx-auto px-4 md:px-8 py-6">
      <Link href="/assets" className="inline-flex items-center gap-1.5 text-sm font-semibold mb-4" style={{ color: 'var(--brand)' }}><ArrowLeft className="w-4 h-4" /> Assets</Link>
      <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Import assets</h1>
      <p className="text-sm mt-0.5 mb-5" style={{ color: 'var(--text-muted)' }}>Upload a Precious Metals export (.xlsx or .csv). Details, stones and cost import; photos/invoices are added separately.</p>

      {!rows.length && !done && (
        <div onClick={() => inputRef.current?.click()} {...importDrop.dropProps} className="rounded-2xl border border-dashed cursor-pointer flex flex-col items-center justify-center gap-2 py-14 transition-all" style={{ borderColor: importDrop.dragOver ? 'var(--brand)' : 'var(--border)', background: importDrop.dragOver ? 'var(--brand-light)' : 'var(--surface-2)' }}>
          <FileSpreadsheet className="w-9 h-9" style={{ color: importDrop.dragOver ? 'var(--brand)' : 'var(--text-faint)' }} />
          <p className="text-sm font-semibold" style={{ color: importDrop.dragOver ? 'var(--brand)' : 'var(--text)' }}>{importDrop.dragOver ? 'Drop the spreadsheet' : 'Click or drop a spreadsheet'}</p>
          <p className="text-xs" style={{ color: 'var(--text-faint)' }}>.xlsx or .csv exported from your Precious Metals board</p>
          <input ref={inputRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={e => e.target.files?.[0] && parseFile(e.target.files[0])} />
        </div>
      )}

      {error && <div className="flex items-center gap-2 text-sm rounded-xl px-4 py-3 mt-4" style={{ background: 'color-mix(in srgb, var(--expense) 10%, transparent)', color: 'var(--expense)' }}><AlertTriangle className="w-4 h-4" /> {error}</div>}

      {rows.length > 0 && !done && (
        <>
          <div className="flex items-center gap-3 flex-wrap my-4">
            <span className="text-sm font-bold" style={{ color: 'var(--text)' }}>{rows.length} items</span>
            {Object.entries(catCounts).map(([c, n]) => <span key={c} className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>{c} · {n}</span>)}
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <div className="grid px-4 py-2.5" style={{ gridTemplateColumns: '1.6fr 0.9fr 0.7fr 0.7fr', background: 'var(--surface-2)', fontSize: 9.5, fontWeight: 800, letterSpacing: '.06em', color: 'var(--text-faint)' }}>
              <span>NAME</span><span>PURITY</span><span className="text-right">NET g</span><span className="text-right">NET WORTH</span>
            </div>
            <div className="max-h-[46vh] overflow-y-auto">
              {rows.map((r, i) => (
                <div key={i} className="grid px-4 py-2 items-center" style={{ gridTemplateColumns: '1.6fr 0.9fr 0.7fr 0.7fr', borderTop: '1px solid var(--border-2, var(--border))' }}>
                  <span className="text-[12.5px] truncate" style={{ color: 'var(--text)' }}>{r.name}</span>
                  <span className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>{r.metal} {r.metal_purity}</span>
                  <span className="text-[11.5px] text-right" style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{r.net ?? '—'}</span>
                  <span className="text-right">{r.include ? <Check className="w-3.5 h-3.5 inline" style={{ color: 'var(--income)' }} /> : <span className="text-[10px]" style={{ color: 'var(--text-faint)' }}>excluded</span>}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={runImport} disabled={importing} className="flex items-center gap-2 text-white text-sm font-bold px-5 py-2.5 rounded-xl disabled:opacity-60" style={{ background: 'var(--brand)' }}>
              {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing {progress}/{rows.length}…</> : <>Import {rows.length} assets</>}
            </button>
            <button onClick={() => { setRows([]); setError('') }} className="text-sm font-semibold px-4 py-2.5 rounded-xl" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>Choose another file</button>
          </div>
        </>
      )}

      {done && (
        <div className="rounded-2xl p-6 text-center mt-4" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}>
          {done.fail > 0 && done.ok === 0 ? (
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'color-mix(in srgb, var(--expense) 14%, transparent)' }}><AlertTriangle className="w-6 h-6" style={{ color: 'var(--expense)' }} /></div>
          ) : (
            <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'color-mix(in srgb, var(--income) 14%, transparent)' }}><Check className="w-6 h-6" style={{ color: 'var(--income)' }} /></div>
          )}
          <p className="text-base font-extrabold" style={{ color: 'var(--text)' }}>Imported {done.ok} asset{done.ok !== 1 ? 's' : ''}</p>
          {done.skip > 0 && <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{done.skip} already existed and were skipped.</p>}
          {done.fail > 0 && <p className="text-sm mt-1 font-semibold" style={{ color: 'var(--expense)' }}>{done.fail} failed.</p>}
          {done.err && <p className="text-[12.5px] mt-2 rounded-lg px-3 py-2 text-left" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}>{done.err}</p>}
          <div className="mt-4 flex items-center justify-center gap-3">
            {done.fail > 0 && <button onClick={() => setDone(null)} className="text-sm font-semibold px-4 py-2.5 rounded-xl" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>Back</button>}
            <button onClick={() => router.push('/assets')} className="text-white text-sm font-bold px-5 py-2.5 rounded-xl" style={{ background: 'var(--brand)' }}>Go to Assets</button>
          </div>
        </div>
      )}
    </div>
  )
}
