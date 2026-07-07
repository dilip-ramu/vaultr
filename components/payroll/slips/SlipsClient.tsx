'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import type { PayrollEntry, PayrollMonth, Employee } from '@/lib/payroll/types'
import SalarySlipPrint from './SalarySlipPrint'
import { buildWhatsAppUrl, salarySlipMessage } from '@/lib/whatsapp'
import { createClient } from '@/lib/supabase/client'
import { resolveCompanyLook, type CompaniesById } from '@/lib/companies/templates'

// Load PDF renderer lazily (large bundle, not needed on first paint)
const SalarySlipPDFDownload = dynamic(() => import('./SalarySlipPDFDownload'), { ssr: false })

interface EnrichedEntry extends PayrollEntry {
  month: PayrollMonth
  employee: Employee
}

interface Props {
  entries: EnrichedEntry[]
  companyName?: string | null
  companyAddress?: string | null
  /** v69 — resolve each employee's company look (name/address/template/accent). */
  companiesById?: CompaniesById
}

function fmtMonth(m: string) {
  if (!m) return ''
  // Try YYYY-MM or YYYY-MM-DD; otherwise just echo whatever the user stored.
  // The user explicitly asked: no "Invalid Date" — show what was typed.
  const parts = m.split('-')
  if (parts.length >= 2) {
    const y  = Number(parts[0])
    const mo = Number(parts[1])
    if (Number.isFinite(y) && Number.isFinite(mo) && mo >= 1 && mo <= 12) {
      const d = new Date(y, mo - 1)
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
      }
    }
  }
  return m
}

function fmtInr(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

function slugName(name: string) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function slugMonth(m: string) {
  const [year, month] = m.split('-')
  const d = new Date(Number(year), Number(month) - 1)
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }).toLowerCase().replace(/\s+/g, '-')
}

export default function SlipsClient({ entries, companyName, companyAddress, companiesById }: Props) {
  const router = useRouter()
  const look = (e: EnrichedEntry) => resolveCompanyLook(e.employee?.company_id, companiesById, companyName, companyAddress)
  const [selectedEntry, setSelectedEntry] = useState<EnrichedEntry | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [emailSummary, setEmailSummary] = useState<string | null>(null)
  const [emailFilter, setEmailFilter] = useState<'all' | 'sent' | 'unsent'>('all')

  const visibleEntries = entries.filter(e =>
    emailFilter === 'all' ? true :
    emailFilter === 'sent' ? !!e.slip_emailed_at : !e.slip_emailed_at
  )
  const sentCount = entries.filter(e => e.slip_emailed_at).length

  // Group by month
  const byMonth: Record<string, EnrichedEntry[]> = {}
  for (const e of visibleEntries) {
    if (!byMonth[e.month.id]) byMonth[e.month.id] = []
    byMonth[e.month.id].push(e)
  }
  const monthGroups = Object.values(byMonth)

  function toggleEntry(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleGroup(group: EnrichedEntry[]) {
    const allSelected = group.every(e => selected.has(e.id))
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) {
        group.forEach(e => next.delete(e.id))
      } else {
        group.forEach(e => next.add(e.id))
      }
      return next
    })
  }

  function toggleAll() {
    if (selected.size === entries.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(entries.map(e => e.id)))
    }
  }

  async function downloadSelected() {
    const toDownload = entries.filter(e => selected.has(e.id))
    if (!toDownload.length) return
    setDownloading(true)
    try {
      const { pdf } = await import('@react-pdf/renderer')
      const { SalarySlipDocument } = await import('./SalarySlipPDF')

      for (const entry of toDownload) {
        const lk = look(entry)
        const doc = (
          <SalarySlipDocument
            entry={entry}
            month={entry.month}
            employee={entry.employee}
            companyName={lk.name}
            companyAddress={lk.address}
            template={lk.template}
            accent={lk.accent}
          />
        )
        const blob = await pdf(doc).toBlob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${slugName(entry.employee.name)}-${slugMonth(entry.month.payroll_month)}.pdf`
        a.click()
        URL.revokeObjectURL(url)
        // small delay between downloads so browser doesn't block them
        await new Promise(r => setTimeout(r, 300))
      }
    } finally {
      setDownloading(false)
    }
  }

  async function emailSlips(ids: string[]) {
    if (!ids.length) return
    setEmailing(true)
    setEmailSummary(null)
    try {
      const res = await fetch('/api/payroll/slips/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_ids: ids }),
      })
      const data = await res.json()
      if (!res.ok) {
        setEmailSummary(`⚠ ${data.error ?? 'Failed to send'}`)
        return
      }
      const results = (data.results ?? []) as { employee: string; status: string; error?: string }[]
      const sent = results.filter(r => r.status === 'sent').length
      const noEmail = results.filter(r => r.status === 'no_email')
      const failed = results.filter(r => r.status === 'error')
      const parts: string[] = []
      if (sent) parts.push(`✓ ${sent} slip${sent !== 1 ? 's' : ''} emailed`)
      if (noEmail.length) parts.push(`✉ no email address: ${noEmail.map(r => r.employee).join(', ')} (add it in Staff)`)
      if (failed.length) parts.push(`✕ failed: ${failed.map(r => `${r.employee} (${r.error})`).join('; ')}`)
      setEmailSummary(parts.join(' · ') || 'Nothing to send')
      if (sent) router.refresh() // pick up the new "emailed" marks
    } catch (err) {
      setEmailSummary(`⚠ ${String(err)}`)
    } finally {
      setEmailing(false)
    }
  }

  // Manual correction: toggle the "emailed" mark without sending anything
  async function toggleEmailedMark(entry: EnrichedEntry) {
    const supabase = createClient()
    await supabase
      .from('payroll_entries')
      .update({ slip_emailed_at: entry.slip_emailed_at ? null : new Date().toISOString() })
      .eq('id', entry.id)
    router.refresh()
  }

  function openWhatsApp(entry: EnrichedEntry) {
    const msg = salarySlipMessage(
      entry.employee.name,
      fmtMonth(entry.month.payroll_month),
      fmtInr(Number(entry.final_payable)),
    )
    const url = buildWhatsAppUrl(entry.employee.whatsapp_number ?? entry.employee.phone, msg)
    if (url) window.open(url, '_blank')
  }

  if (selectedEntry) {
    return (
      <div>
        <div className="no-print flex items-center justify-between mb-6 w-full">
          <button onClick={() => setSelectedEntry(null)} className="text-[var(--text-muted)] hover:text-[var(--text)] text-sm">
            ← Back to list
          </button>
          <div className="flex items-center gap-3">
            <SalarySlipPDFDownload
              entry={selectedEntry}
              month={selectedEntry.month}
              employee={selectedEntry.employee}
              companyName={look(selectedEntry).name}
              companyAddress={look(selectedEntry).address}
              template={look(selectedEntry).template}
              accent={look(selectedEntry).accent}
              filename={`${slugName(selectedEntry.employee.name)}-${slugMonth(selectedEntry.month.payroll_month)}.pdf`}
            />
            <button
              onClick={() => window.print()}
              className="px-4 py-2 border border-[var(--border)] text-[var(--text)] rounded-lg text-sm font-medium hover:bg-[var(--surface-2)]"
            >
              🖨 Print
            </button>
            {/* Custom block-based template (Feature: customisable templates).
                Opens the HTML print view with the company's assigned salary-slip
                template (or the classic layout if none). */}
            <a
              href={`/payroll/slips/${selectedEntry.id}/print`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 border border-[var(--border)] text-[var(--text)] rounded-lg text-sm font-medium hover:bg-[var(--surface-2)]"
            >
              Template PDF
            </a>
          </div>
        </div>
        <SalarySlipPrint
          entry={selectedEntry}
          month={selectedEntry.month}
          employee={selectedEntry.employee}
          companyName={look(selectedEntry).name}
          companyAddress={look(selectedEntry).address}
          template={look(selectedEntry).template}
          accent={look(selectedEntry).accent}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Salary Slips</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            {entries.length} slip{entries.length !== 1 ? 's' : ''} across {monthGroups.length} month{monthGroups.length !== 1 ? 's' : ''}
          </p>
        </div>
        {entries.length > 0 && (
          <div className="flex items-center gap-3">
            <button onClick={toggleAll} className="text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
              {selected.size === entries.length ? 'Deselect all' : 'Select all'}
            </button>
            {selected.size > 0 && (
              <>
                <button
                  onClick={downloadSelected}
                  disabled={downloading}
                  className="px-4 py-2 btn-brand text-white rounded-lg text-sm font-medium  disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {downloading
                    ? <><span className="animate-spin">⏳</span> Downloading…</>
                    : <>⬇ Download {selected.size} slip{selected.size !== 1 ? 's' : ''}</>
                  }
                </button>
                <button
                  onClick={() => emailSlips([...selected])}
                  disabled={emailing}
                  className="px-4 py-2 btn-brand text-white rounded-lg text-sm font-medium  disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {emailing
                    ? <><span className="animate-spin">⏳</span> Emailing…</>
                    : <>✉ Email {selected.size} slip{selected.size !== 1 ? 's' : ''}</>
                  }
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Email status filter */}
      {entries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {([
            { key: 'all', label: `All (${entries.length})` },
            { key: 'sent', label: `✓ Emailed (${sentCount})` },
            { key: 'unsent', label: `Not emailed (${entries.length - sentCount})` },
          ] as { key: 'all' | 'sent' | 'unsent'; label: string }[]).map(f => (
            <button
              key={f.key}
              onClick={() => setEmailFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                emailFilter === f.key ? 'btn-brand text-white' : 'bg-[var(--surface-2)] text-[var(--text-muted)] hover:bg-[var(--border)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Email result banner */}
      {emailSummary && (
        <div className="bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text)] text-sm rounded-xl px-4 py-3 flex items-start justify-between gap-3">
          <span>{emailSummary}</span>
          <button onClick={() => setEmailSummary(null)} className="text-[var(--text-faint)] hover:text-[var(--text-muted)] shrink-0">×</button>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-faint)]">
          No salary slips yet. Finalize a payroll month to generate slips.
        </div>
      ) : (
        <div className="space-y-8">
          {monthGroups.map(group => {
            const month = group[0].month
            const total = group.reduce((s, e) => s + Number(e.final_payable), 0)
            const allGroupSelected = group.every(e => selected.has(e.id))
            const someGroupSelected = group.some(e => selected.has(e.id))

            return (
              <div key={month.id}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={allGroupSelected}
                      ref={el => { if (el) el.indeterminate = someGroupSelected && !allGroupSelected }}
                      onChange={() => toggleGroup(group)}
                      className="w-4 h-4 rounded border-[var(--border)] text-[var(--transfer)] cursor-pointer"
                    />
                    <h2 className="font-semibold text-[var(--text)]">{fmtMonth(month.payroll_month)}</h2>
                  </div>
                  <span className="text-sm text-[var(--text-muted)]">
                    Total: <span className="font-medium text-[var(--text)]">{fmtInr(total)}</span>
                  </span>
                </div>

                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-[var(--surface-2)] border-b border-[var(--border)]">
                      <tr>
                        <th className="px-4 py-3 w-8"></th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Employee</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Salary €</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Salary ₹</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Adjustments</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">Net Payable</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-2)]">
                      {group.map(entry => {
                        const adjustments =
                          Number(entry.allowances) + Number(entry.overtime) + Number(entry.incentives)
                          - Number(entry.deductions) - Number(entry.advance)
                        return (
                          <tr key={entry.id} className={`hover:bg-[var(--surface-2)] transition-colors ${selected.has(entry.id) ? 'bg-[var(--surface-2)]' : ''}`}>
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={selected.has(entry.id)}
                                onChange={() => toggleEntry(entry.id)}
                                className="w-4 h-4 rounded border-[var(--border)] text-[var(--transfer)] cursor-pointer"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-[var(--text)]">{entry.employee?.name ?? '—'}</div>
                              <div className="text-xs text-[var(--text-faint)]">{entry.employee?.employee_id ?? ''}</div>
                              {entry.slip_emailed_at ? (
                                <div className="text-[11px] text-[var(--income)] mt-0.5">
                                  ✓ emailed {new Date(entry.slip_emailed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                                  <button
                                    onClick={() => toggleEmailedMark(entry)}
                                    className="ml-1.5 text-[var(--text-faint)] hover:text-[var(--text-muted)]"
                                    title="Clear the emailed mark (doesn't send anything)"
                                  >
                                    ×
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => toggleEmailedMark(entry)}
                                  className="text-[11px] text-[var(--text-faint)] hover:text-[var(--text-muted)] mt-0.5"
                                  title="Mark as emailed without sending (e.g. sent outside the app)"
                                >
                                  mark emailed
                                </button>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-[var(--text)]">
                              €{Number(entry.salary_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-[var(--text)]">
                              {fmtInr(Number(entry.salary_inr))}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-sm">
                              {adjustments !== 0 ? (
                                <span className={adjustments > 0 ? 'text-[var(--income)]' : 'text-[var(--expense)]'}>
                                  {adjustments > 0 ? '+' : ''}{fmtInr(Math.abs(adjustments))}
                                </span>
                              ) : <span className="text-[var(--text-faint)]">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-semibold text-[var(--text)]">
                              {fmtInr(Number(entry.final_payable))}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-3">
                                {entry.employee?.email && (
                                  <button
                                    onClick={() => emailSlips([entry.id])}
                                    disabled={emailing}
                                    title={`Email slip to ${entry.employee.email}`}
                                    className="text-xs text-[var(--income)] hover:text-[var(--income)] font-medium disabled:opacity-50"
                                  >
                                    ✉ Email
                                  </button>
                                )}
                                {buildWhatsAppUrl(entry.employee?.whatsapp_number ?? entry.employee?.phone, '') && (
                                  <button
                                    onClick={() => openWhatsApp(entry)}
                                    title="Open WhatsApp chat with a prefilled message"
                                    className="text-xs text-[var(--income)] hover:text-[var(--income)] font-medium"
                                  >
                                    WhatsApp
                                  </button>
                                )}
                                <button
                                  onClick={() => setSelectedEntry(entry)}
                                  className="text-xs text-[var(--transfer)] hover:text-[var(--transfer)] font-medium"
                                >
                                  View & Print
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
