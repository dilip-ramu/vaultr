'use client'

import type { PayrollEntry, PayrollMonth, Employee } from '@/lib/payroll/types'
import { type InvoiceTemplate, normalizeTemplate, normalizeAccent } from '@/lib/companies/templates'

interface Props {
  entry: PayrollEntry
  month: PayrollMonth
  employee: Employee
  companyName?: string | null
  companyAddress?: string | null
  /** v69 — per-company look (Feature 1c). */
  template?: InvoiceTemplate | string | null
  accent?: string | null
}

function fmtInr(n: number) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

function fmtMonth(m: string) {
  if (!m) return ''
  // Tolerant: parse YYYY-MM or YYYY-MM-DD, otherwise echo as-is.
  const parts = m.split('-')
  if (parts.length >= 2) {
    const y  = Number(parts[0])
    const mo = Number(parts[1])
    if (Number.isFinite(y) && Number.isFinite(mo) && mo >= 1 && mo <= 12) {
      const date = new Date(y, mo - 1)
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
      }
    }
  }
  return m
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

export default function SalarySlipPrint({ entry, month, employee, companyName, companyAddress, template, accent }: Props) {
  const tpl = normalizeTemplate(template)
  const ac = normalizeAccent(accent)
  const name = companyName ?? 'Company Name'
  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #slip-print, #slip-print * { visibility: visible; }
          #slip-print { position: absolute; inset: 0; margin: 0; padding: 20px; }
          .no-print { display: none !important; }
          #slip-print * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        @page { size: A4; margin: 15mm; }
      `}</style>

      <div id="slip-print" className="bg-[var(--surface)] p-8 max-w-2xl mx-auto font-sans text-sm ">
        {/* Company header (per template, v69) */}
        {tpl === 'modern' ? (
          <div className="rounded-md p-4 mb-4 text-center" style={{ background: ac }}>
            <h1 className="text-xl font-bold text-white">{name}</h1>
            {companyAddress && <p className="text-xs text-white/90 mt-1">{companyAddress}</p>}
            <p className="text-base font-semibold text-white mt-2">SALARY SLIP · {fmtMonth(month.payroll_month)}</p>
          </div>
        ) : tpl === 'minimal' ? (
          <div className="mb-4">
            <h1 className="text-xl font-bold inline-block pb-0.5" style={{ color: ac, borderBottom: `2px solid ${ac}` }}>{name}</h1>
            {companyAddress && <p className="text-xs  mt-1">{companyAddress}</p>}
            <p className="text-base font-semibold  mt-3">SALARY SLIP</p>
            <p className="text-sm ">For the month of {fmtMonth(month.payroll_month)}</p>
          </div>
        ) : (
          <div className="text-center pb-4 mb-4" style={{ borderBottom: `2px solid ${ac}` }}>
            <h1 className="text-xl font-bold ">{name}</h1>
            {companyAddress && <p className="text-xs  mt-1">{companyAddress}</p>}
            <p className="text-base font-semibold  mt-3">SALARY SLIP</p>
            <p className="text-sm ">For the month of {fmtMonth(month.payroll_month)}</p>
          </div>
        )}

        {/* Employee details */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 mb-5 text-xs">
          <div>
            <span className="">Employee Name:</span>
            <span className="ml-2 font-medium">{employee.name}</span>
          </div>
          <div>
            <span className="">Employee ID:</span>
            <span className="ml-2 font-medium">{employee.employee_id}</span>
          </div>
          <div>
            <span className="">Designation:</span>
            <span className="ml-2 font-medium">{employee.designation ?? '—'}</span>
          </div>
          <div>
            <span className="">Date of Joining:</span>
            <span className="ml-2 font-medium">{fmtDate(employee.joining_date)}</span>
          </div>
          {employee.pan_number && (
            <div>
              <span className="">PAN:</span>
              <span className="ml-2 font-medium font-mono">{employee.pan_number}</span>
            </div>
          )}
          {month.payment_date && (
            <div>
              <span className="">Payment Date:</span>
              <span className="ml-2 font-medium">{fmtDate(month.payment_date)}</span>
            </div>
          )}
        </div>

        {/* Salary breakdown */}
        <table className="w-full border border-[var(--border)] text-xs mb-4">
          <thead>
            <tr style={tpl === 'modern' ? { background: ac, color: '#fff' } : { background: '#f3f4f6' }}>
              <th className="border border-[var(--border)] px-3 py-2 text-left font-semibold" colSpan={2}>EARNINGS</th>
              <th className="border border-[var(--border)] px-3 py-2 text-left font-semibold" colSpan={2}>DEDUCTIONS</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border border-[var(--border)] px-3 py-2 ">Basic Salary (INR)</td>
              <td className="border border-[var(--border)] px-3 py-2 text-right font-mono">₹{fmtInr(Number(entry.salary_inr))}</td>
              <td className="border border-[var(--border)] px-3 py-2 ">Deductions</td>
              <td className="border border-[var(--border)] px-3 py-2 text-right font-mono">
                {Number(entry.deductions) > 0 ? `₹${fmtInr(Number(entry.deductions))}` : '—'}
              </td>
            </tr>
            <tr>
              <td className="border border-[var(--border)] px-3 py-2 ">Allowances</td>
              <td className="border border-[var(--border)] px-3 py-2 text-right font-mono">
                {Number(entry.allowances) > 0 ? `₹${fmtInr(Number(entry.allowances))}` : '—'}
              </td>
              <td className="border border-[var(--border)] px-3 py-2 ">Advance Recovery</td>
              <td className="border border-[var(--border)] px-3 py-2 text-right font-mono">
                {Number(entry.advance) > 0 ? `₹${fmtInr(Number(entry.advance))}` : '—'}
              </td>
            </tr>
            <tr>
              <td className="border border-[var(--border)] px-3 py-2 ">Overtime</td>
              <td className="border border-[var(--border)] px-3 py-2 text-right font-mono">
                {Number(entry.overtime) > 0 ? `₹${fmtInr(Number(entry.overtime))}` : '—'}
              </td>
              <td className="border border-[var(--border)] px-3 py-2" />
              <td className="border border-[var(--border)] px-3 py-2" />
            </tr>
            <tr>
              <td className="border border-[var(--border)] px-3 py-2 ">Incentives</td>
              <td className="border border-[var(--border)] px-3 py-2 text-right font-mono">
                {Number(entry.incentives) > 0 ? `₹${fmtInr(Number(entry.incentives))}` : '—'}
              </td>
              <td className="border border-[var(--border)] px-3 py-2" />
              <td className="border border-[var(--border)] px-3 py-2" />
            </tr>
            <tr className=" font-semibold">
              <td className="border border-[var(--border)] px-3 py-2">Gross Earnings</td>
              <td className="border border-[var(--border)] px-3 py-2 text-right font-mono">
                ₹{fmtInr(
                  Number(entry.salary_inr) +
                  Number(entry.allowances) +
                  Number(entry.overtime) +
                  Number(entry.incentives)
                )}
              </td>
              <td className="border border-[var(--border)] px-3 py-2">Total Deductions</td>
              <td className="border border-[var(--border)] px-3 py-2 text-right font-mono">
                ₹{fmtInr(Number(entry.deductions) + Number(entry.advance))}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Net payable */}
        <div className="border-2 rounded p-3 flex items-center justify-between" style={{ borderColor: ac }}>
          <div>
            <p className="text-xs ">Net Salary Payable</p>
            <p className="text-2xl font-bold" style={{ color: ac }}>₹{fmtInr(Number(entry.final_payable))}</p>
            <p className="text-xs  mt-0.5 italic">{amountToWords(Number(entry.final_payable))}</p>
          </div>
          {month.expended_rate > 0 && (
            <div className="text-right text-xs ">
              <div>Salary (€): €{Number(entry.salary_amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
              <div>Exchange Rate: ₹{Number(entry.expended_rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })} / €</div>
            </div>
          )}
        </div>

        {/* Bank details */}
        {(employee.bank_name || employee.account_number) && (
          <div className="mt-4 pt-4 border-t border-[var(--border)] text-xs ">
            <p className="font-semibold  mb-1">Bank Transfer Details</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              {employee.bank_name && <div><span className="">Bank:</span> {employee.bank_name}</div>}
              {employee.account_number && <div><span className="">Account:</span> <span className="font-mono">{employee.account_number}</span></div>}
              {employee.ifsc && <div><span className="">IFSC:</span> <span className="font-mono">{employee.ifsc}</span></div>}
              {employee.branch && <div><span className="">Branch:</span> {employee.branch}</div>}
            </div>
          </div>
        )}

        {/* Notes */}
        {entry.notes && (
          <div className="mt-3 pt-3 border-t border-[var(--border)] text-xs ">
            <span className="font-medium">Note:</span> {entry.notes}
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-[var(--border)] flex justify-between text-xs ">
          <span>This is a computer-generated salary slip.</span>
          <span>{companyName ?? ''}</span>
        </div>
      </div>
    </>
  )
}
