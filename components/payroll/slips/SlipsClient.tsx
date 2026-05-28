'use client'

import { useState } from 'react'
import type { PayrollEntry, PayrollMonth, Employee } from '@/lib/payroll/types'
import SalarySlipPrint from './SalarySlipPrint'

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
  const date = new Date(Number(year), Number(month) - 1)
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

function fmtInr(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

export default function SlipsClient({ entries, companyName, companyAddress }: Props) {
  const [selectedEntry, setSelectedEntry] = useState<EnrichedEntry | null>(null)

  if (selectedEntry) {
    return (
      <div>
        <div className="no-print flex items-center justify-between mb-6 max-w-2xl mx-auto">
          <button
            onClick={() => setSelectedEntry(null)}
            className="text-gray-500 hover:text-gray-900 text-sm"
          >
            ← Back to list
          </button>
          <button
            onClick={() => window.print()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            🖨 Print Slip
          </button>
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

  // Group by month
  const byMonth: Record<string, EnrichedEntry[]> = {}
  for (const e of entries) {
    const key = e.month.id
    if (!byMonth[key]) byMonth[key] = []
    byMonth[key].push(e)
  }
  const monthGroups = Object.values(byMonth)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Salary Slips</h1>
        <p className="text-sm text-gray-500 mt-1">{entries.length} slip{entries.length !== 1 ? 's' : ''} across {monthGroups.length} month{monthGroups.length !== 1 ? 's' : ''}</p>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          No salary slips yet. Finalize a payroll month to generate slips.
        </div>
      ) : (
        <div className="space-y-8">
          {monthGroups.map(group => {
            const month = group[0].month
            const total = group.reduce((s, e) => s + Number(e.final_payable), 0)
            return (
              <div key={month.id}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-semibold text-gray-800">{fmtMonth(month.payroll_month)}</h2>
                  <span className="text-sm text-gray-500">Total: <span className="font-medium text-gray-900">{fmtInr(total)}</span></span>
                </div>
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
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
                          Number(entry.allowances) +
                          Number(entry.overtime) +
                          Number(entry.incentives) -
                          Number(entry.deductions) -
                          Number(entry.advance)
                        return (
                          <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
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
                              <button
                                onClick={() => setSelectedEntry(entry)}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                              >
                                View & Print
                              </button>
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
