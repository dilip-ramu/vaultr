'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { Download, AlertTriangle, FileJson, FileSpreadsheet } from 'lucide-react'
import { gstr1Csv, gstr1Json, type Gstr1, type Gstr3b, type Section } from '@/lib/gst/returns'

interface CompanyOpt { id: string; name: string; gstin: string | null }

const inr = (n: number) =>
  (n < 0 ? '−' : '') + '₹' + new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n))

const SECTIONS: { key: Section; label: string; note: string }[] = [
  { key: 'b2b', label: 'B2B', note: 'Supplies to registered buyers (table 4).' },
  { key: 'b2cl', label: 'B2C Large', note: 'Unregistered, inter-state, above ₹2.5 lakh (table 5).' },
  { key: 'b2cs', label: 'B2C Small', note: 'All other unregistered supplies (table 7).' },
  { key: 'cdnr', label: 'Credit / Debit Notes', note: 'Notes issued to registered buyers (table 9B).' },
  { key: 'cdnur', label: 'Notes — unregistered', note: 'Notes issued to unregistered buyers (table 9B).' },
]

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  URL.revokeObjectURL(url)
}

export default function GstReturnsClient({
  companies, companyId, month, gstr1, gstr3b, inwardCount, unbrokenBills,
}: {
  companies: CompanyOpt[]
  companyId: string
  month: string
  gstr1: Gstr1 | null
  gstr3b: Gstr3b | null
  inwardCount: number
  unbrokenBills: number
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'gstr1' | 'gstr3b'>('gstr1')

  const go = (patch: { company?: string; month?: string }) => {
    const p = new URLSearchParams({ company: patch.company ?? companyId, month: patch.month ?? month })
    router.push(`/gst?${p.toString()}`)
  }

  const bySection = useMemo(() => {
    const m = new Map<Section, Gstr1['rows']>()
    for (const r of gstr1?.rows ?? []) m.set(r.section, [...(m.get(r.section) ?? []), r])
    return m
  }, [gstr1])

  const company = companies.find(c => c.id === companyId)
  const warnings = [...(gstr1?.warnings ?? []), ...(gstr3b?.warnings ?? [])]

  const card = { borderColor: 'var(--border)', background: 'var(--surface)' }
  const th = 'text-left text-[10px] font-extrabold uppercase tracking-wide px-3 py-2'
  const td = 'px-3 py-2 text-[13px]'

  return (
    <div className="w-full px-4 md:px-8 py-6 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>GST returns</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Derived from the invoices and notes already in Vaultr. Nothing here is filed for you — check it, then upload.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={companyId}
            onChange={e => go({ company: e.target.value })}
            className="px-3 py-2 rounded-lg border text-sm font-semibold"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
          >
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input
            type="month"
            value={month}
            onChange={e => e.target.value && go({ month: e.target.value })}
            className="px-3 py-2 rounded-lg border text-sm font-semibold"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--text)' }}
          />
        </div>
      </div>

      {company && (
        <div className="text-[12px] font-semibold" style={{ color: 'var(--text-muted)' }}>
          GSTIN {company.gstin || <span style={{ color: '#c0392b' }}>not set</span>} · return period {gstr1?.period ?? '—'}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-2xl border p-4" style={{ borderColor: '#f0c36d', background: 'rgba(240,195,109,.10)' }}>
          <div className="flex items-center gap-2 mb-1.5">
            <AlertTriangle className="w-4 h-4" style={{ color: '#b7791f' }} />
            <span className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>Check before you file</span>
          </div>
          <ul className="space-y-1">
            {warnings.map((w, i) => (
              <li key={i} className="text-[13px]" style={{ color: 'var(--text-muted)' }}>· {w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-1" style={{ borderBottom: '1px solid var(--border)' }}>
        {(['gstr1', 'gstr3b'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="relative px-3.5 py-2.5 text-[13px] font-bold"
            style={{ color: tab === t ? 'var(--brand)' : 'var(--text-muted)' }}
          >
            {t === 'gstr1' ? 'GSTR-1 (outward)' : 'GSTR-3B (summary)'}
            {tab === t && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full" style={{ background: 'var(--brand)' }} />}
          </button>
        ))}
      </div>

      {tab === 'gstr1' && gstr1 && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => download(`GSTR1-${gstr1.period}.csv`, gstr1Csv(gstr1), 'text/csv')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-white text-xs font-bold"
              style={{ background: 'var(--brand)' }}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> CSV
            </button>
            <button
              onClick={() => download(`GSTR1-${gstr1.period}.json`, JSON.stringify(gstr1Json(gstr1), null, 2), 'application/json')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              <FileJson className="w-3.5 h-3.5" /> Offline-tool JSON
            </button>
            <span className="text-[12px]" style={{ color: 'var(--text-faint)' }}>
              {gstr1.rows.length} document(s) · taxable {inr(gstr1.totals.taxable)} · tax {inr(gstr1.totals.igst + gstr1.totals.cgst + gstr1.totals.sgst)}
            </span>
          </div>

          {SECTIONS.map(s => {
            const rows = bySection.get(s.key) ?? []
            if (!rows.length) return null
            return (
              <div key={s.key} className="rounded-2xl border overflow-hidden" style={card}>
                <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>{s.label}</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{s.note}</div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead style={{ background: 'var(--surface-2)' }}>
                      <tr style={{ color: 'var(--text-muted)' }}>
                        <th className={th}>Number</th>
                        <th className={th}>Date</th>
                        <th className={th}>Party</th>
                        <th className={th}>GSTIN</th>
                        <th className={th}>Place of supply</th>
                        <th className={th + ' !text-right'}>Rate</th>
                        <th className={th + ' !text-right'}>Taxable</th>
                        <th className={th + ' !text-right'}>IGST</th>
                        <th className={th + ' !text-right'}>CGST</th>
                        <th className={th + ' !text-right'}>SGST</th>
                        <th className={th + ' !text-right'}>Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.number} style={{ borderTop: '1px solid var(--border)', color: 'var(--text)' }}>
                          <td className={td + ' font-bold'}>
                            {r.number}
                            {r.noteType && (
                              <span className="ml-1.5 text-[10px] font-extrabold" style={{ color: r.noteType === 'C' ? '#c0392b' : '#2563eb' }}>
                                {r.noteType === 'C' ? 'CR' : 'DR'}
                              </span>
                            )}
                          </td>
                          <td className={td} style={{ color: 'var(--text-muted)' }}>{r.date}</td>
                          <td className={td}>{r.party}</td>
                          <td className={td + ' font-mono text-[11px]'} style={{ color: 'var(--text-muted)' }}>{r.gstin ?? '—'}</td>
                          <td className={td} style={{ color: 'var(--text-muted)' }}>{r.placeOfSupply || '—'}</td>
                          <td className={td + ' text-right'}>{r.rate}%</td>
                          <td className={td + ' text-right'}>{inr(r.taxable)}</td>
                          <td className={td + ' text-right'}>{inr(r.igst)}</td>
                          <td className={td + ' text-right'}>{inr(r.cgst)}</td>
                          <td className={td + ' text-right'}>{inr(r.sgst)}</td>
                          <td className={td + ' text-right font-bold'}>{inr(r.invoiceValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}

          {gstr1.hsn.length > 0 && (
            <div className="rounded-2xl border overflow-hidden" style={card}>
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>HSN summary</div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Table 12 — every supply rolled up by HSN and rate.</div>
              </div>
              <table className="w-full">
                <thead style={{ background: 'var(--surface-2)' }}>
                  <tr style={{ color: 'var(--text-muted)' }}>
                    <th className={th}>HSN</th>
                    <th className={th}>Description</th>
                    <th className={th + ' !text-right'}>Qty</th>
                    <th className={th + ' !text-right'}>Rate</th>
                    <th className={th + ' !text-right'}>Taxable</th>
                    <th className={th + ' !text-right'}>IGST</th>
                    <th className={th + ' !text-right'}>CGST</th>
                    <th className={th + ' !text-right'}>SGST</th>
                  </tr>
                </thead>
                <tbody>
                  {gstr1.hsn.map(h => (
                    <tr key={h.hsn + h.rate} style={{ borderTop: '1px solid var(--border)', color: 'var(--text)' }}>
                      <td className={td + ' font-bold'}>{h.hsn}</td>
                      <td className={td} style={{ color: 'var(--text-muted)' }}>{h.description || '—'}</td>
                      <td className={td + ' text-right'}>{h.qty}</td>
                      <td className={td + ' text-right'}>{h.rate}%</td>
                      <td className={td + ' text-right'}>{inr(h.taxable)}</td>
                      <td className={td + ' text-right'}>{inr(h.igst)}</td>
                      <td className={td + ' text-right'}>{inr(h.cgst)}</td>
                      <td className={td + ' text-right'}>{inr(h.sgst)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {gstr1.rows.length === 0 && (
            <div className="rounded-2xl border p-8 text-center" style={card}>
              <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>Nothing supplied in this period</div>
              <div className="text-[13px] mt-1" style={{ color: 'var(--text-muted)' }}>
                No invoices or notes dated in {month} for this company. You&apos;d file a nil return.
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'gstr3b' && gstr3b && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border p-5" style={card}>
            <div className="text-sm font-extrabold mb-1" style={{ color: 'var(--text)' }}>3.1(a) Outward taxable supplies</div>
            <div className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>Invoices plus debit notes, less credit notes.</div>
            <Line label="Taxable value" value={gstr3b.outward.taxable} strong />
            <Line label="IGST" value={gstr3b.outward.igst} />
            <Line label="CGST" value={gstr3b.outward.cgst} />
            <Line label="SGST" value={gstr3b.outward.sgst} />
          </div>

          <div className="rounded-2xl border p-5" style={card}>
            <div className="text-sm font-extrabold mb-1" style={{ color: 'var(--text)' }}>4(A) Input tax credit</div>
            <div className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
              From {inwardCount} supplier bill(s) this month.
              {unbrokenBills > 0 && <> {unbrokenBills} have no GST breakup entered, so they claim nothing.</>}
            </div>
            <Line label="IGST" value={gstr3b.itc.igst} />
            <Line label="CGST" value={gstr3b.itc.cgst} />
            <Line label="SGST" value={gstr3b.itc.sgst} />
          </div>

          <div className="rounded-2xl border p-5 lg:col-span-2" style={card}>
            <div className="text-sm font-extrabold mb-3" style={{ color: 'var(--text)' }}>Tax payable (output tax less credit)</div>
            <Line label="IGST" value={gstr3b.net.igst} />
            <Line label="CGST" value={gstr3b.net.cgst} />
            <Line label="SGST" value={gstr3b.net.sgst} />
            <div className="flex items-center justify-between pt-3 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <span className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>
                {gstr3b.net.total >= 0 ? 'Net payable in cash' : 'Credit carried forward'}
              </span>
              <span className="text-xl font-extrabold" style={{ color: gstr3b.net.total >= 0 ? 'var(--text)' : '#1F5C3A' }}>
                {inr(Math.abs(gstr3b.net.total))}
              </span>
            </div>
            <p className="text-[11px] mt-3" style={{ color: 'var(--text-faint)' }}>
              A simple per-head netting. It does not apply the portal&apos;s IGST set-off order across heads, so the
              cash figure on the portal may differ — treat this as your check, not as the filing itself.
            </p>
          </div>

          <button
            onClick={() => download(`GSTR3B-${gstr3b.period}.json`, JSON.stringify(gstr3b, null, 2), 'application/json')}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold w-fit"
            style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
          >
            <Download className="w-3.5 h-3.5" /> Download summary
          </button>
        </div>
      )}

      {!gstr1 && (
        <div className="rounded-2xl border p-8 text-center" style={card}>
          <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>Add a company first</div>
        </div>
      )}
    </div>
  )
}

function Line({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className={strong ? 'text-[15px] font-extrabold' : 'text-[13px] font-semibold'} style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
        {inr(value)}
      </span>
    </div>
  )
}
