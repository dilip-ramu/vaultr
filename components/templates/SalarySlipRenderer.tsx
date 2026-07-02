'use client'

import { accentSoft } from '@/lib/companies/templates'
import { amountToWords } from '@/lib/recoverables/invoices/words'
import type { DocumentSchema, Block, FieldDef } from '@/lib/templates/schema'
import type { PayrollEntry, PayrollMonth, Employee } from '@/lib/payroll/types'

export interface SalarySlipDocData {
  entry: PayrollEntry
  month: PayrollMonth
  employee: Employee
  companyName: string | null
  companyAddress: string | null
}

interface Props { schema: DocumentSchema; data: SalarySlipDocData | null; preview?: boolean }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
function fmtMonth(m: string) { if (!m || !m.includes('-')) return m ?? ''; const [y, mo] = m.split('-'); const i = parseInt(mo, 10) - 1; return i >= 0 && i < 12 ? `${MONTHS[i]} ${y}` : m }
function fmtDate(d: string | null) { if (!d) return '—'; const dt = new Date(d); return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
function fmtInr(n: number) { return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) }
const S = (v: unknown, d = '') => (typeof v === 'string' ? v : d)
const B = (v: unknown, d = false) => (typeof v === 'boolean' ? v : d)

export default function SalarySlipRenderer({ schema, data, preview = false }: Props) {
  const accent = schema.theme.accent || '#2A7A50'
  const fontFamily = schema.theme.font === 'serif' ? "Georgia, 'Times New Roman', serif" : "system-ui, -apple-system, sans-serif"
  const margin = schema.theme.pageMarginMm || 14
  const sheetStyle = {
    ['--accent' as string]: accent, ['--accent-soft' as string]: accentSoft(accent), fontFamily,
    ...(preview ? {} : { padding: `${margin}mm ${margin}mm` }),
  } as React.CSSProperties

  if (!data) return <div className="vslip"><div className={`sheet${preview ? ' sheet--preview' : ''}`} style={sheetStyle}>No data</div></div>

  const { entry, month, employee } = data
  const name = data.companyName ?? 'Company Name'
  const num = (v: unknown) => Number(v ?? 0)
  const gross = num(entry.salary_inr) + num(entry.allowances) + num(entry.overtime) + num(entry.incentives)
  const totalDed = num(entry.deductions) + num(entry.advance)
  const earnVal: Record<string, number> = { basic: num(entry.salary_inr), allowances: num(entry.allowances), overtime: num(entry.overtime), incentives: num(entry.incentives) }
  const dedVal: Record<string, number> = { deductions: num(entry.deductions), advance: num(entry.advance) }
  const empVal: Record<string, string> = {
    name: employee.name, employee_id: employee.employee_id, designation: employee.designation ?? '—',
    joining_date: fmtDate(employee.joining_date), pan_number: employee.pan_number ?? '—', payment_date: fmtDate(month.payment_date),
  }

  const sHeader = (p: Record<string, unknown>) => {
    const variant = S(p.variant, 'plain'); const title = S(p.title, 'Salary Slip'); const showAddr = B(p.showAddress, true)
    const sub = `For the month of ${fmtMonth(month.payroll_month)}`
    if (variant === 'band') return (
      <div className="s-band" key="h"><div className="s-band-name">{name}</div>{showAddr && data.companyAddress && <div className="s-band-addr">{data.companyAddress}</div>}<div className="s-band-title">{title.toUpperCase()} · {fmtMonth(month.payroll_month)}</div></div>
    )
    if (variant === 'minimal') return (
      <div key="h" style={{ marginBottom: 10 }}><span className="s-min-name">{name}</span>{showAddr && data.companyAddress && <div className="s-sub">{data.companyAddress}</div>}<div className="s-title" style={{ marginTop: 6 }}>{title}</div><div className="s-sub">{sub}</div></div>
    )
    return (
      <div className="s-head" key="h"><div className="s-name">{name}</div>{showAddr && data.companyAddress && <div className="s-sub">{data.companyAddress}</div>}<div className="s-title">{title.toUpperCase()}</div><div className="s-sub">{sub}</div></div>
    )
  }

  const sEmployee = (p: Record<string, unknown>) => {
    const fields = (Array.isArray(p.fields) ? p.fields : []) as FieldDef[]
    return <div className="s-emp" key="e">{fields.filter(f => f.visible).map(f => (
      <div key={f.key} className="s-emp-item"><span className="s-emp-label">{f.label}: </span><span className="s-emp-val">{empVal[f.key] ?? ''}</span></div>
    ))}</div>
  }

  const sEarnings = (p: Record<string, unknown>) => {
    const earnings = ((p.earnings as FieldDef[]) ?? []).filter(f => f.visible)
    const deductions = ((p.deductions as FieldDef[]) ?? []).filter(f => f.visible)
    const hs = S(p.headerStyle, 'grey')
    const rows = Math.max(earnings.length, deductions.length)
    return (
      <table className={`s-table hs-${hs}`} key="ea">
        <thead><tr><th>Earnings</th><th className="r">Amount (Rs.)</th><th>Deductions</th><th className="r">Amount (Rs.)</th></tr></thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => {
            const e = earnings[i]; const d = deductions[i]
            return (
              <tr key={i}>
                <td>{e?.label ?? ''}</td><td className="r">{e ? (earnVal[e.key] > 0 ? fmtInr(earnVal[e.key]) : '—') : ''}</td>
                <td>{d?.label ?? ''}</td><td className="r">{d ? (dedVal[d.key] > 0 ? fmtInr(dedVal[d.key]) : '—') : ''}</td>
              </tr>
            )
          })}
          <tr className="s-tot"><td>Gross Earnings</td><td className="r">{fmtInr(gross)}</td><td>Total Deductions</td><td className="r">{fmtInr(totalDed)}</td></tr>
        </tbody>
      </table>
    )
  }

  const sNet = (p: Record<string, unknown>) => (
    <div className="s-net" key="n">
      <div>
        <div className="s-net-label">Net Salary Payable</div>
        <div className="s-net-amt">Rs. {fmtInr(num(entry.final_payable))}</div>
        {B(p.showWords, true) && <div className="s-net-words">{amountToWords(num(entry.final_payable), 'INR')}</div>}
      </div>
      {B(p.showForex, true) && num(month.expended_rate) > 0 && (
        <div style={{ textAlign: 'right', fontSize: 8, color: '#666' }}>
          <div>Salary: {fmtInr(num(entry.salary_amount))} {employee.salary_currency || 'EUR'}</div>
          <div>Exchange Rate: Rs. {fmtInr(num(entry.expended_rate))}</div>
        </div>
      )}
    </div>
  )

  const sBank = (p: Record<string, unknown>) => {
    if (!(employee.bank_name || employee.account_number)) return null
    return (
      <div className="s-bank" key="b"><div className="s-bank-title">{S(p.title, 'Bank Transfer Details')}</div>
        <div className="s-emp">
          {employee.bank_name && <div className="s-emp-item"><span className="s-emp-label">Bank: </span>{employee.bank_name}</div>}
          {employee.account_number && <div className="s-emp-item"><span className="s-emp-label">Account: </span>{employee.account_number}</div>}
          {employee.ifsc && <div className="s-emp-item"><span className="s-emp-label">IFSC: </span>{employee.ifsc}</div>}
          {employee.branch && <div className="s-emp-item"><span className="s-emp-label">Branch: </span>{employee.branch}</div>}
        </div>
      </div>
    )
  }

  const sFooter = (p: Record<string, unknown>) => (
    <div className="s-foot" key="f"><span>{S(p.note, 'This is a computer-generated salary slip.')}</span><span>{name}</span></div>
  )

  const renderBlock = (b: Block): React.ReactNode => {
    if (!b.visible) return null
    const p = b.props ?? {}
    switch (b.type) {
      case 'sHeader': return sHeader(p)
      case 'sEmployee': return sEmployee(p)
      case 'sEarnings': return sEarnings(p)
      case 'sNet': return sNet(p)
      case 'sBank': return sBank(p)
      case 'sFooter': return sFooter(p)
      case 'text': return <div key={b.id} style={{ textAlign: (S(p.align, 'left') as 'left' | 'center' | 'right'), fontSize: Number(p.sizePt) || 9, fontWeight: B(p.bold) ? 700 : 400, margin: '6px 0', whiteSpace: 'pre-wrap' }}>{S(p.content)}</div>
      case 'divider': return <hr key={b.id} style={{ border: 'none', borderTop: '1px solid #ddd', margin: '10px 0' }} />
      case 'spacer': return <div key={b.id} style={{ height: Number(p.heightPx) || 16 }} />
      default: return null
    }
  }

  return (
    <div className="vslip">
      <style>{`
        .vslip *, .vslip *::before, .vslip *::after { box-sizing:border-box; }
        .vslip .sheet { background:#fff; width:210mm; min-height:297mm; margin:32px auto; padding:14mm; box-shadow:0 4px 24px rgba(0,0,0,.15); color:#1a1a1a; font-size:9px; line-height:1.5; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .vslip .sheet--preview { width:100%; min-height:auto; margin:0; box-shadow:none; padding:20px 22px; border-radius:10px; }
        .vslip .s-head { text-align:center; border-bottom:2px solid var(--accent); padding-bottom:8px; margin-bottom:10px; }
        .vslip .s-name { font-size:14px; font-weight:700; }
        .vslip .s-title { font-size:11px; font-weight:600; color:#444; margin-top:3px; }
        .vslip .s-sub { font-size:9px; color:#666; margin-top:2px; }
        .vslip .s-band { background:var(--accent); color:#fff; border-radius:5px; padding:12px; margin-bottom:10px; text-align:center; }
        .vslip .s-band-name { font-size:14px; font-weight:700; }
        .vslip .s-band-addr { font-size:8px; opacity:.9; margin-top:2px; }
        .vslip .s-band-title { font-size:10px; margin-top:4px; }
        .vslip .s-min-name { font-size:14px; font-weight:700; color:var(--accent); border-bottom:2px solid var(--accent); padding-bottom:2px; }
        .vslip .s-emp { display:flex; flex-wrap:wrap; margin-bottom:10px; }
        .vslip .s-emp-item { width:50%; margin-bottom:4px; font-size:9px; }
        .vslip .s-emp-label { color:#777; }
        .vslip .s-emp-val { font-weight:700; }
        .vslip .s-table { width:100%; border-collapse:collapse; border:1px solid #ccc; margin-bottom:8px; }
        .vslip .s-table th { padding:4px; font-size:8px; font-weight:700; text-align:left; border-bottom:1px solid #ccc; }
        .vslip .s-table th.r, .vslip .s-table td.r { text-align:right; }
        .vslip .s-table td { padding:4px; font-size:9px; border-bottom:0.5px solid #eee; }
        .vslip .s-table.hs-grey th { background:#f0f0f0; }
        .vslip .s-table.hs-filled th { background:var(--accent); color:#fff; }
        .vslip .s-table.hs-plain th { border-bottom:1.5px solid var(--accent); }
        .vslip .s-table tr.s-tot td { background:#f8f8f8; font-weight:700; }
        .vslip .s-net { border:2px solid var(--accent); border-radius:4px; padding:10px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:flex-start; }
        .vslip .s-net-label { font-size:8px; color:#777; }
        .vslip .s-net-amt { font-size:16px; font-weight:700; color:var(--accent); }
        .vslip .s-net-words { font-size:7px; color:#555; margin-top:3px; font-style:italic; }
        .vslip .s-bank { border-top:0.5px solid #ddd; padding-top:8px; margin-top:4px; }
        .vslip .s-bank-title { font-size:8px; font-weight:700; margin-bottom:4px; }
        .vslip .s-foot { margin-top:16px; border-top:0.5px solid #ddd; padding-top:6px; display:flex; justify-content:space-between; font-size:7px; color:#aaa; }
        @media print { .vslip .sheet { margin:0; box-shadow:none; width:100%; } }
      `}</style>
      <div className={`sheet${preview ? ' sheet--preview' : ''}`} style={sheetStyle}>
        {schema.blocks.map(b => <div key={b.id}>{renderBlock(b)}</div>)}
      </div>
    </div>
  )
}
