'use client'

import type { PayrollEntry, PayrollMonth, Employee } from '@/lib/payroll/types'

interface Props {
  entry: PayrollEntry
  month: PayrollMonth
  employee: Employee
  companyName?: string | null
  companyAddress?: string | null
}

function fmtInr(n: number) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtMonth(m: string) {
  const [year, month] = m.split('-')
  const date = new Date(Number(year), Number(month) - 1)
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Simple amount to words (INR)
function amountToWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function belowHundred(n: number): string {
    if (n < 20) return ones[n]
    return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '')
  }

  function convert(n: number): string {
    if (n === 0) return ''
    if (n < 100) return belowHundred(n)
    if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + belowHundred(n % 100) : '')
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '')
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '')
    return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '')
  }

  const rupees = Math.floor(amount)
  const paise = Math.round((amount - rupees) * 100)
  let words = convert(rupees)
  if (!words) words = 'Zero'
  words += ' Rupees'
  if (paise > 0) words += ' and ' + convert(paise) + ' Paise'
  return words + ' Only'
}

export default function SalarySlipPrint({ entry, month, employee, companyName, companyAddress }: Props) {
  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #slip-print, #slip-print * { visibility: visible; }
          #slip-print { position: absolute; inset: 0; margin: 0; padding: 20px; }
          .no-print { display: none !important; }
        }
        @page { size: A4; margin: 15mm; }
      `}</style>

      <div id="slip-print" className="bg-white p-8 max-w-2xl mx-auto font-sans text-sm text-gray-900">
        {/* Company header */}
        <div className="text-center border-b-2 border-gray-800 pb-4 mb-4">
          <h1 className="text-xl font-bold text-gray-900">{companyName ?? 'Company Name'}</h1>
          {companyAddress && <p className="text-xs text-gray-500 mt-1">{companyAddress}</p>}
          <p className="text-base font-semibold text-gray-700 mt-3">SALARY SLIP</p>
          <p className="text-sm text-gray-500">For the month of {fmtMonth(month.payroll_month)}</p>
        </div>

        {/* Employee details */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 mb-5 text-xs">
          <div>
            <span className="text-gray-500">Employee Name:</span>
            <span className="ml-2 font-medium">{employee.name}</span>
          </div>
          <div>
            <span className="text-gray-500">Employee ID:</span>
            <span className="ml-2 font-medium">{employee.employee_id}</span>
          </div>
          <div>
            <span className="text-gray-500">Designation:</span>
            <span className="ml-2 font-medium">{employee.designation ?? '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Date of Joining:</span>
            <span className="ml-2 font-medium">{fmtDate(employee.joining_date)}</span>
          </div>
          {employee.pan_number && (
            <div>
              <span className="text-gray-500">PAN:</span>
              <span className="ml-2 font-medium font-mono">{employee.pan_number}</span>
            </div>
          )}
          {month.payment_date && (
            <div>
              <span className="text-gray-500">Payment Date:</span>
              <span className="ml-2 font-medium">{fmtDate(month.payment_date)}</span>
            </div>
          )}
        </div>

        {/* Salary breakdown */}
        <table className="w-full border border-gray-300 text-xs mb-4">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-3 py-2 text-left font-semibold" colSpan={2}>EARNINGS</th>
              <th className="border border-gray-300 px-3 py-2 text-left font-semibold" colSpan={2}>DEDUCTIONS</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-gray-300 px-3 py-2 text-gray-600">Basic Salary (INR)</td>
              <td className="border border-gray-300 px-3 py-2 text-right font-mono">₹{fmtInr(Number(entry.salary_inr))}</td>
              <td className="border border-gray-300 px-3 py-2 text-gray-600">Deductions</td>
              <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                {Number(entry.deductions) > 0 ? `₹${fmtInr(Number(entry.deductions))}` : '—'}
              </td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-3 py-2 text-gray-600">Allowances</td>
              <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                {Number(entry.allowances) > 0 ? `₹${fmtInr(Number(entry.allowances))}` : '—'}
              </td>
              <td className="border border-gray-300 px-3 py-2 text-gray-600">Advance Recovery</td>
              <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                {Number(entry.advance) > 0 ? `₹${fmtInr(Number(entry.advance))}` : '—'}
              </td>
            </tr>
            <tr>
              <td className="border border-gray-300 px-3 py-2 text-gray-600">Overtime</td>
              <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                {Number(entry.overtime) > 0 ? `₹${fmtInr(Number(entry.overtime))}` : '—'}
              </td>
              <td className="border border-gray-300 px-3 py-2" />
              <td className="border border-gray-300 px-3 py-2" />
            </tr>
            <tr>
              <td className="border border-gray-300 px-3 py-2 text-gray-600">Incentives</td>
              <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                {Number(entry.incentives) > 0 ? `₹${fmtInr(Number(entry.incentives))}` : '—'}
              </td>
              <td className="border border-gray-300 px-3 py-2" />
              <td className="border border-gray-300 px-3 py-2" />
            </tr>
            <tr className="bg-gray-50 font-semibold">
              <td className="border border-gray-300 px-3 py-2">Gross Earnings</td>
              <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                ₹{fmtInr(
                  Number(entry.salary_inr) +
                  Number(entry.allowances) +
                  Number(entry.overtime) +
                  Number(entry.incentives)
                )}
              </td>
              <td className="border border-gray-300 px-3 py-2">Total Deductions</td>
              <td className="border border-gray-300 px-3 py-2 text-right font-mono">
                ₹{fmtInr(Number(entry.deductions) + Number(entry.advance))}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Net payable */}
        <div className="border-2 border-gray-800 rounded p-3 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Net Salary Payable</p>
            <p className="text-2xl font-bold text-gray-900">₹{fmtInr(Number(entry.final_payable))}</p>
            <p className="text-xs text-gray-500 mt-0.5 italic">{amountToWords(Number(entry.final_payable))}</p>
          </div>
          {month.expended_rate > 0 && (
            <div className="text-right text-xs text-gray-500">
              <div>Salary (€): €{Number(entry.salary_euro).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
              <div>Exchange Rate: ₹{Number(entry.expended_rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })} / €</div>
            </div>
          )}
        </div>

        {/* Bank details */}
        {(employee.bank_name || employee.account_number) && (
          <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-600">
            <p className="font-semibold text-gray-700 mb-1">Bank Transfer Details</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {employee.bank_name && <div><span className="text-gray-400">Bank:</span> {employee.bank_name}</div>}
              {employee.account_number && <div><span className="text-gray-400">Account:</span> <span className="font-mono">{employee.account_number}</span></div>}
              {employee.ifsc && <div><span className="text-gray-400">IFSC:</span> <span className="font-mono">{employee.ifsc}</span></div>}
              {employee.branch && <div><span className="text-gray-400">Branch:</span> {employee.branch}</div>}
            </div>
          </div>
        )}

        {/* Notes */}
        {entry.notes && (
          <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
            <span className="font-medium">Note:</span> {entry.notes}
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-gray-200 flex justify-between text-xs text-gray-400">
          <span>This is a computer-generated salary slip.</span>
          <span>{companyName ?? ''}</span>
        </div>
      </div>
    </>
  )
}
