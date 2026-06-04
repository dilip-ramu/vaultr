'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import type { PayrollEntry, PayrollMonth, Employee } from '@/lib/payroll/types'
import SalarySlipPrint from './SalarySlipPrint'
import { buildWhatsAppUrl, salarySlipMessage } from '@/lib/whatsapp'

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
}

function fmtMonth(m: string) {
  const [year, month] = m.split('-')
  return new Date(Number(year), Number(month) - 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
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

export default function SlipsClient({ entries, companyName, companyAddress }: Props) {
  const [selectedEntry, setSelectedEntry] = useState<EnrichedEntry | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [emailSummary, setEmailSummary] = useState<string | null>(null)

  // Group by month
  const byMonth: Record<string, EnrichedEntry[]> = {}
  for (const e of entries) {
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
        const doc = (
          <SalarySlipDocument
            entry={entry}
            month={entry.month}
            employee={entry.employee}
            companyName={companyName}
            companyAddress={companyAddress}
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
    } catch (err) {
      setEmailSummary(`⚠ ${String(err)}`)
    } finally {
      setEmailing(false)
    }
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
        <div className="no-print flex items-center justify-between mb-6 max-w-2xl mx-auto">
          <button onClick={() => setSelectedEntry(null)} className="text-gray-500 hover:text-gray-900 text-sm">
            ← Back to list
          </button>
          <div className="flex items-center gap-3">
            <SalarySlipPDFDownload
              entry={selectedEntry}
              month={selectedEntry.month}
              employee={selectedEntry.employee}
              companyName={companyName}
              companyAddress={companyAddress}
              filename={`${slugName(selectedEntry.employee.name)}-${slugMonth(selectedEntry.month.payroll_month)}.pdf`}
            />
            <button
              onClick={() => window.print()}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
            >
              🖨 Print
            </button>
          </div>
        </div>
        <SalarySlipPrint
          entry={selectedEntry}
          month={selectedEntry.month}
          employee={selectedEntry.employee}
          companyName={companyName}
          companyAddress={companyAddress}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Salary Slips</h1>
          <p className="text-sm text-gray-500 mt-1">
            {entries.length} slip{entries.length !== 1 ? 's' : ''} across {monthGroups.length} month{monthGroups.length !== 1 ? 's' : ''}
          </p>
        </div>
        {entries.length > 0 && (
          <div className="flex items-center gap-3">
            <button onClick={toggleAll} className="text-sm text-gray-500 hover:text-gray-900">
              {selected.size === entries.length ? 'Deselect all' : 'Select all'}
            </button>
            {selected.size > 0 && (
              <>
                <button
                  onClick={downloadSelected}
                  disabled={downloading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {downloading
                    ? <><span className="animate-spin">⏳</span> Downloading…</>
                    : <>⬇ Download {selected.size} slip{selected.size !== 1 ? 's' : ''}</>
                  }
                </button>
                <button
                  onClick={() => emailSlips([...selected])}
                  disabled={emailing}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors flex items-center gap-2"
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

      {/* Email result banner */}
      {emailSummary && (
        <div className="bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-xl px-4 py-3 flex items-start justify-between gap-3">
          <span>{emailSummary}</span>
          <button onClick={() => setEmailSummary(null)} className="text-gray-400 hover:text-gray-600 shrink-0">×</button>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
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
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                    />
                    <h2 className="font-semibold text-gray-800">{fmtMonth(month.payroll_month)}</h2>
                  </div>
                  <span className="text-sm text-gray-500">
                    Total: <span className="font-medium text-gray-900">{fmtInr(total)}</span>
                  </span>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 w-8"></th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Employee</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Salary €</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Salary ₹</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Adjustments</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Net Payable</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {group.map(entry => {
                        const adjustments =
                          Number(entry.allowances) + Number(entry.overtime) + Number(entry.incentives)
                          - Number(entry.deductions) - Number(entry.advance)
                        return (
                          <tr key={entry.id} className={`hover:bg-gray-50 transition-colors ${selected.has(entry.id) ? 'bg-blue-50' : ''}`}>
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={selected.has(entry.id)}
                                onChange={() => toggleEntry(entry.id)}
                                className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900">{entry.employee?.name ?? '—'}</div>
                              <div className="text-xs text-gray-400">{entry.employee?.employee_id ?? ''}</div>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-gray-700">
                              €{Number(entry.salary_euro).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-gray-700">
                              {fmtInr(Number(entry.salary_inr))}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-sm">
                              {adjustments !== 0 ? (
                                <span className={adjustments > 0 ? 'text-green-600' : 'text-red-500'}>
                                  {adjustments > 0 ? '+' : ''}{fmtInr(Math.abs(adjustments))}
                                </span>
                              ) : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                              {fmtInr(Number(entry.final_payable))}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-3">
                                {entry.employee?.email && (
                                  <button
                                    onClick={() => emailSlips([entry.id])}
                                    disabled={emailing}
                                    title={`Email slip to ${entry.employee.email}`}
                                    className="text-xs text-emerald-600 hover:text-emerald-800 font-medium disabled:opacity-50"
                                  >
                                    ✉ Email
                                  </button>
                                )}
                                {buildWhatsAppUrl(entry.employee?.whatsapp_number ?? entry.employee?.phone, '') && (
                                  <button
                                    onClick={() => openWhatsApp(entry)}
                                    title="Open WhatsApp chat with a prefilled message"
                                    className="text-xs text-green-600 hover:text-green-800 font-medium"
                                  >
                                    WhatsApp
                                  </button>
                                )}
                                <button
                                  onClick={() => setSelectedEntry(entry)}
                                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
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
