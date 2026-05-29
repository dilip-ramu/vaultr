'use client'

import { useState } from 'react'
import { Download, Archive, CheckSquare, Square, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
type ModuleKey =
  | 'transactions' | 'accounts' | 'recoverable_invoices' | 'supplier_invoices'
  | 'contrast_expenses' | 'contrast_invoices' | 'payroll' | 'staff' | 'bills'

const MODULE_LABELS: Record<ModuleKey, { label: string; folder: string; desc: string }> = {
  transactions:         { label: 'Transactions',            folder: '01_Transactions',         desc: 'All income & expense transactions' },
  accounts:             { label: 'Bank Accounts',           folder: '02_Bank_Accounts',         desc: 'Account balances & bank details' },
  recoverable_invoices: { label: 'Recoverable Invoices',    folder: '03_Recoverable_Invoices',  desc: 'Customer invoices & receivables' },
  supplier_invoices:    { label: 'Supplier Invoices',       folder: '04_Supplier_Invoices',     desc: 'Vendor bills & payables' },
  contrast_expenses:    { label: 'Contrast Expenses',       folder: '05_Contrast_Expenses',     desc: 'Categorized Contrast billing items' },
  contrast_invoices:    { label: 'Contrast Invoices',       folder: '06_Contrast_Invoices',     desc: 'Proforma invoices to Contrast A/S' },
  payroll:              { label: 'Payroll Entries',         folder: '07_Payroll',               desc: 'Monthly salary calculations' },
  staff:                { label: 'Staff Particulars',       folder: '08_Staff',                 desc: 'Employee details & bank info' },
  bills:                { label: 'Bills & Subscriptions',   folder: '09_Bills',                 desc: 'Recurring bills and subscriptions' },
}

const ALL_MODULES = Object.keys(MODULE_LABELS) as ModuleKey[]

type Status = 'idle' | 'fetching' | 'generating' | 'zipping' | 'done' | 'error'

// ── CSV helpers ───────────────────────────────────────────────────────────────
function csvRow(values: (string | number | null | undefined)[]): string {
  return values.map(v => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')
}
function csv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [headers, ...rows].map(r => csvRow(r)).join('\n')
}
function fmtDate(d: string | null | undefined) { return d ? d.split('T')[0] : '' }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safe(v: any) { return v ?? '' }

// ── CSV generators per module ─────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildCSVs(data: Record<string, any[]>): Record<string, string> {
  const out: Record<string, string> = {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (key: string, fn: (r: any) => (string | number | null | undefined)[]) =>
    (data[key] ?? []).map(fn)

  out['transactions'] = csv(
    ['Date', 'Type', 'Description', 'Category', 'Payee', 'Account', 'Account Type', 'Amount', 'Currency', 'Notes'],
    rows('transactions', t => [
      fmtDate(t.date), t.type, t.name, safe(t.category_name), safe(t.payee_name),
      safe(t.account_name), safe(t.account_type), t.amount, safe(t.currency), safe(t.notes),
    ])
  )

  out['accounts'] = csv(
    ['Account Name', 'Type', 'Currency', 'Balance', 'Account Number', 'Bank', 'Active'],
    rows('accounts', a => [
      a.name, a.type, safe(a.currency), a.balance, safe(a.account_number), safe(a.bank_name), a.is_active ? 'Yes' : 'No',
    ])
  )

  out['recoverable_invoices'] = csv(
    ['Invoice Number', 'Customer', 'Invoice Date', 'Due Date', 'Total (INR)', 'Status', 'Notes'],
    rows('recoverable_invoices', inv => [
      inv.invoice_number, inv.customer_name, fmtDate(inv.invoice_date), fmtDate(inv.due_date),
      inv.total, inv.status, safe(inv.notes),
    ])
  )

  out['supplier_invoices'] = csv(
    ['Invoice Number', 'Supplier', 'Invoice Date', 'Due Date', 'Amount', 'Currency', 'Category', 'Status'],
    rows('supplier_invoices', inv => [
      inv.invoice_number, safe(inv.supplier_name), fmtDate(inv.invoice_date), fmtDate(inv.due_date),
      inv.amount, safe(inv.currency), safe(inv.category), inv.status,
    ])
  )

  out['contrast_expenses'] = csv(
    ['Date', 'Description', 'Category', 'Billing Category', 'Amount (INR)', 'Notes'],
    rows('contrast_expenses', e => [
      fmtDate(e.date), e.name, safe(e.category_name), safe(e.billing_category_name), e.amount, safe(e.notes),
    ])
  )

  out['contrast_invoices'] = csv(
    ['Invoice Number', 'Month', 'Invoice Date', 'Subtotal (EUR)', 'GST (EUR)', 'Total (EUR)', 'Status', 'Notes'],
    rows('contrast_invoices', inv => [
      inv.invoice_number, inv.invoice_month, fmtDate(inv.invoice_date),
      inv.subtotal, inv.gst_amount, inv.total, inv.status, safe(inv.notes),
    ])
  )

  out['payroll'] = csv(
    ['Month', 'Employee', 'Employee ID', 'Designation', 'Salary (EUR)', 'Exchange Rate', 'Salary (INR)', 'Allowances', 'Overtime', 'Incentives', 'Deductions', 'Advance', 'Net Payable (INR)', 'Finalized', 'Paid', 'Payment Date'],
    rows('payroll_entries', e => [
      safe(e.payroll_month?.payroll_month), safe(e.employee?.name), safe(e.employee?.employee_id),
      safe(e.employee?.designation), e.salary_euro, e.expended_rate, e.salary_inr,
      e.allowances, e.overtime, e.incentives, e.deductions, e.advance, e.final_payable,
      e.payroll_month?.is_finalized ? 'Yes' : 'No',
      e.payroll_month?.is_paid ? 'Yes' : 'No',
      fmtDate(e.payroll_month?.payment_date),
    ])
  )

  out['staff'] = csv(
    ['Name', 'Employee ID', 'Designation', 'Salary (EUR)', 'Bank', 'Branch', 'Account Number', 'IFSC', 'Active', 'Joining Date'],
    rows('staff', emp => [
      emp.name, emp.employee_id, safe(emp.designation), emp.salary_euro,
      safe(emp.bank_name), safe(emp.branch), safe(emp.account_number),
      safe(emp.ifsc), emp.is_active ? 'Yes' : 'No', fmtDate(emp.joining_date),
    ])
  )

  // Bills
  out['bills'] = csv(
    ['Name', 'Direction', 'Frequency', 'Due Date', 'Amount', 'Currency', 'Status', 'Notes'],
    rows('bills', b => [
      b.name, b.direction, safe(b.frequency), fmtDate(b.due_date),
      b.amount, safe(b.currency), b.status, safe(b.notes),
    ])
  )

  return out
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DownloadsClient() {
  const today = new Date().toISOString().split('T')[0]
  const firstOfYear = `${new Date().getFullYear()}-01-01`

  const [fromDate, setFromDate] = useState(firstOfYear)
  const [toDate, setToDate]     = useState(today)
  const [selected, setSelected] = useState<Set<ModuleKey>>(new Set(ALL_MODULES))
  const [status, setStatus]     = useState<Status>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [error, setError]       = useState('')

  const toggleAll = () =>
    setSelected(selected.size === ALL_MODULES.length ? new Set() : new Set(ALL_MODULES))
  const toggle = (m: ModuleKey) =>
    setSelected(prev => { const s = new Set(prev); s.has(m) ? s.delete(m) : s.add(m); return s })

  async function handleExport() {
    if (selected.size === 0) { setError('Select at least one module.'); return }
    setError('')
    try {
      // 1. Fetch data
      setStatus('fetching')
      setStatusMsg('Fetching data from all modules…')
      const res = await fetch('/api/downloads/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromDate, to: toDate }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to fetch data')
      const data = await res.json()

      // Surface any partial query failures
      if (data.query_errors && Object.keys(data.query_errors).length > 0) {
        console.warn('[Export] Some queries had errors:', data.query_errors)
        const failedModules = Object.keys(data.query_errors).join(', ')
        setError(`Warning: some modules had query errors and will export empty — ${failedModules}. Check console for details.`)
      }

      // 2. Generate CSVs
      setStatus('generating')
      setStatusMsg('Building CSV files…')
      const csvFiles = buildCSVs(data)

      // 3. Generate main report PDF + individual salary slips
      setStatusMsg('Generating PDF report…')
      const [{ pdf }, { default: ExportReportPDF }, { SalarySlipDocument }, React] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./ExportReportPDF'),
        import('../payroll/slips/SalarySlipPDF'),
        import('react'),
      ])
      const pdfBlob2 = await pdf(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        React.createElement(ExportReportPDF, { data }) as any
      ).toBlob()

      // Generate individual salary slip PDFs
      const salarySlipFiles: { name: string; blob: Blob }[] = []
      const entries = (data.payroll_entries ?? []) as Record<string, unknown>[]
      if (entries.length > 0) {
        setStatusMsg(`Generating ${entries.length} salary slip${entries.length !== 1 ? 's' : ''}…`)
        for (const entry of entries) {
          const emp = entry.employee as Record<string, unknown> | null
          const month = entry.payroll_month as Record<string, unknown> | null
          if (!emp || !month) continue
          // Only generate slips for finalized months (unfinalized = amounts not confirmed)
          if (!month.is_finalized) continue
          try {
            const slipBlob = await pdf(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              React.createElement(SalarySlipDocument, {
                entry, month, employee: emp,
                companyName:    data.meta?.company_name    ?? null,
                companyAddress: data.meta?.company_address ?? null,
              }) as any
            ).toBlob()
            const safeName = String(emp.name ?? 'Employee').replace(/[/\\:*?"<>|,]+/g, '_')
            const monthStr = String(month.payroll_month ?? '')
            salarySlipFiles.push({ name: `SalarySlip_${safeName}_${monthStr}.pdf`, blob: slipBlob })
          } catch { /* skip individual failures */ }
        }
      }

      // 4. Download attachments
      const attachments: { folder: string; filename: string; blob: Blob }[] = []
      if (data.attachments?.length > 0) {
        setStatusMsg(`Downloading ${data.attachments.length} attachment${data.attachments.length !== 1 ? 's' : ''}…`)
        for (const att of data.attachments) {
          if (!att.signed_url) continue
          try {
            const fileRes = await fetch(att.signed_url)
            if (!fileRes.ok) continue
            const blob = await fileRes.blob()

            // parent_name and parent_date are set by the API from the lookup maps
            const parentName: string = String(att.parent_name ?? 'attachment')
            const parentDate: string = String(att.parent_date ?? '')
            const ext = String(att.file_name ?? 'file').split('.').pop() ?? 'bin'
            const safeName = parentName.replace(/[/\\:*?"<>|,\r\n]+/g, '_').trim()
            const filename = parentDate ? `${safeName}_${parentDate}.${ext}` : `${safeName}.${ext}`
            const folder = att.transaction_id ? '10_Attachments/Transactions' : '10_Attachments/Bills'

            attachments.push({ folder, filename, blob })
          } catch {
            // Skip failed downloads silently
          }
        }
      }

      // 5. Create ZIP
      setStatus('zipping')
      setStatusMsg('Packing everything into a ZIP file…')
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()

      const prefix = `INEX_Export_${fromDate}_to_${toDate}`
      const root = zip.folder(prefix)!

      // PDF report at root
      root.file('INEX_Full_Report.pdf', pdfBlob2)

      // CSVs in folders
      const folderMap: Record<string, string> = {
        transactions:         '01_Transactions/Transactions.csv',
        accounts:             '02_Bank_Accounts/Bank_Accounts.csv',
        recoverable_invoices: '03_Recoverable_Invoices/Recoverable_Invoices.csv',
        supplier_invoices:    '04_Supplier_Invoices/Supplier_Invoices.csv',
        contrast_expenses:    '05_Contrast_Expenses/Contrast_Expenses.csv',
        contrast_invoices:    '06_Contrast_Invoices/Contrast_Invoices.csv',
        payroll:              '07_Payroll/Payroll_Entries.csv',
        staff:                '08_Staff/Staff_Particulars.csv',
        bills:                '09_Bills/Bills_Subscriptions.csv',
      }
      for (const [key, path] of Object.entries(folderMap)) {
        if (selected.has(key as ModuleKey) && csvFiles[key]) {
          root.file(path, csvFiles[key])
        }
      }

      // Add salary slips to ZIP
      for (const { name, blob } of salarySlipFiles) {
        root.file(`07_Salary_Slips/${name}`, blob)
      }

      // Add attachments to ZIP
      for (const { folder, filename, blob } of attachments) {
        root.file(`${folder}/${filename}`, blob)
      }

      const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })

      // 5. Download
      const url = URL.createObjectURL(zipBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${prefix}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setStatus('done')
      setStatusMsg(`Export complete — ${prefix}.zip downloaded.`)
    } catch (e) {
      setError((e as Error).message)
      setStatus('error')
      setStatusMsg('')
    }
  }

  const isRunning = status === 'fetching' || status === 'generating' || status === 'zipping'

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
          <Archive className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Data Export & Backup</h1>
          <p className="text-sm text-gray-500">Download all your data as a ZIP with readable PDFs and machine-readable CSVs</p>
        </div>
      </div>

      {/* Date range */}
      <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Date Range</h2>
        <p className="text-xs text-gray-400">Applies to transactions, invoices, and dated records. Staff and accounts export fully regardless of range.</p>
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input
              type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              disabled={isRunning}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-50"
            />
          </div>
          <div className="text-gray-400 mt-5">→</div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input
              type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              disabled={isRunning}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-50"
            />
          </div>
        </div>
      </div>

      {/* Module selection */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Modules to Include</h2>
          <button
            onClick={toggleAll}
            disabled={isRunning}
            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
          >
            {selected.size === ALL_MODULES.length
              ? <><CheckSquare className="w-3.5 h-3.5" /> Deselect all</>
              : <><Square className="w-3.5 h-3.5" /> Select all</>
            }
          </button>
        </div>
        <div className="divide-y divide-gray-50">
          {ALL_MODULES.map(m => {
            const checked = selected.has(m)
            const info = MODULE_LABELS[m]
            return (
              <div
                key={m}
                onClick={() => !isRunning && toggle(m)}
                className={`flex items-center gap-4 px-5 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${!checked ? 'opacity-40' : ''}`}
              >
                <input
                  type="checkbox" checked={checked} onChange={() => toggle(m)}
                  disabled={isRunning}
                  onClick={e => e.stopPropagation()}
                  className="w-4 h-4 accent-indigo-600 cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{info.label}</p>
                  <p className="text-xs text-gray-400">{info.desc}</p>
                </div>
                <span className="text-xs text-gray-300 font-mono">{info.folder}/</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* What you get */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl px-5 py-4 text-sm text-indigo-700 space-y-1">
        <p className="font-semibold">What&apos;s included in the ZIP:</p>
        <p className="text-xs text-indigo-600">📄 <strong>INEX_Full_Report.pdf</strong> — human-readable report with all sections, tables, and summaries</p>
        <p className="text-xs text-indigo-600">📊 <strong>CSV files</strong> per module in named folders — clean, labelled, importable into Excel or any system</p>
        <p className="text-xs text-indigo-600">📁 All inside <strong>INEX_Export_{fromDate}_to_{toDate}/</strong></p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Status / progress */}
      {(isRunning || status === 'done') && (
        <div className={`rounded-xl px-5 py-4 flex items-center gap-3 text-sm ${status === 'done' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-indigo-50 border border-indigo-100 text-indigo-700'}`}>
          {isRunning
            ? <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            : <CheckCircle2 className="w-4 h-4 shrink-0" />
          }
          {statusMsg}
        </div>
      )}

      {/* Action */}
      <button
        onClick={handleExport}
        disabled={isRunning || selected.size === 0}
        className="flex items-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isRunning
          ? <Loader2 className="w-4 h-4 animate-spin" />
          : <Download className="w-4 h-4" />
        }
        {isRunning ? statusMsg.split('…')[0] + '…' : 'Generate & Download ZIP'}
      </button>
    </div>
  )
}
