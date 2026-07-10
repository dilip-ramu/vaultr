'use client'

import type { SalarySlipDocData } from '@/lib/payroll/slip'
import { amountToWords } from '@/lib/recoverables/invoices/words'
import { BAND_COLORS } from '@/lib/documents/model'

/**
 * Salary slip — Claude design (frame 17a). Layout schema is from the Claude
 * design; every field is the app's own existing slip data (Basic = salary_inr,
 * Allowances, Overtime, Incentives → Gross; Deductions, Advance → Total; Net =
 * final_payable; plus source salary + FX rate). Per-company logo, name,
 * address and accent flow in from the print page.
 */

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
function fmtMonth(m: string) {
  if (!m || !m.includes('-')) return m ?? ''
  const [y, mo] = m.split('-'); const i = parseInt(mo, 10) - 1
  return i >= 0 && i < 12 ? `${MONTHS[i]} ${y}` : m
}
function fmtDate(d: string | null) {
  if (!d) return '—'
  const dt = new Date(d); return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
const fmtInr = (n: number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const num = (v: unknown) => Number(v ?? 0)

export default function SalarySlip17a({
  data, logoUrl = null, signatureUrl = null, accent = '#1F5C3A', preview = false,
}: {
  data: SalarySlipDocData
  logoUrl?: string | null
  signatureUrl?: string | null
  accent?: string
  preview?: boolean
}) {
  const { entry, month, employee, companyName, companyAddress } = data

  const basic = num(entry.salary_inr)
  const earnings: [string, number][] = [
    ['Basic', basic],
    ['Allowances', num(entry.allowances)],
    ['Overtime', num(entry.overtime)],
    ['Incentives', num(entry.incentives)],
  ]
  const deductions: [string, number][] = [
    ['Deductions', num(entry.deductions)],
    ['Advance', num(entry.advance)],
  ]
  const gross = earnings.reduce((s, [, v]) => s + v, 0)
  const totalDed = deductions.reduce((s, [, v]) => s + v, 0)
  const net = num(entry.final_payable)

  const LBL: React.CSSProperties = { fontSize: '9px', fontWeight: 800, letterSpacing: '.1em', color: '#aaa', margin: '0 0 5px' }
  const numSt: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }
  const colHead: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr auto', fontSize: '9px', fontWeight: 800, letterSpacing: '.08em', color: '#aaa', paddingBottom: '8px', borderBottom: '1px solid #eee' }
  const rowSt: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr auto', fontSize: '11.5px', color: '#222', padding: '11px 0', borderBottom: '1px solid #f2f2f2' }
  const totSt: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr auto', fontSize: '11.5px', fontWeight: 700, color: '#111', padding: '11px 0' }
  const cell = (v: number) => (v > 0 ? fmtInr(v) : '—')

  const band = (month as { is_paid?: boolean }).is_paid
    ? { label: 'PAID', tone: 'green' as const }
    : (month as { is_finalized?: boolean }).is_finalized
      ? { label: 'FINALIZED', tone: 'blue' as const }
      : { label: 'DRAFT', tone: 'grey' as const }
  const bandC = BAND_COLORS[band.tone]

  return (
    <div className="vinv" style={{ background: preview ? 'transparent' : '#e5e7eb', padding: preview ? 0 : '28px 0', display: 'flex', justifyContent: 'center' }}>
      <div className="sheet" style={{
        position: 'relative', overflow: 'hidden',
        width: preview ? '100%' : '210mm', minHeight: preview ? 'auto' : '297mm',
        background: '#fff', color: '#111', fontFamily: "'Manrope', system-ui, sans-serif",
        borderRadius: preview ? '10px' : '2px',
        boxShadow: preview ? 'none' : '0 12px 40px rgba(0,0,0,.16)',
        WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
      }}>
        {/* accent top strip */}
        <div style={{ height: '6px', background: accent }} />
        {/* status band, top-left */}
        <div style={{ position: 'absolute', top: '6px', left: 0, zIndex: 2, background: bandC.bg, color: bandC.fg, fontSize: '10px', fontWeight: 800, letterSpacing: '.06em', padding: '5px 14px 5px 34px', borderBottomRightRadius: '10px' }}>{band.label}</div>

        <div style={{ padding: preview ? '30px 34px' : '40px 44px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px', marginTop: '18px', marginBottom: '34px' }}>
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoUrl && <img src={logoUrl} alt="" style={{ width: '5.5cm', maxHeight: '2.8cm', height: 'auto', objectFit: 'contain', objectPosition: 'left center', marginBottom: '12px', display: 'block' }} />}
            <p style={{ fontSize: '11px', color: '#888', lineHeight: 1.55, margin: 0 }}>
              <span style={{ fontWeight: 700, color: '#333' }}>{companyName ?? 'Your Company'}</span>
              {companyAddress && <><br />{companyAddress}</>}
            </p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: '19px', fontWeight: 800, letterSpacing: '-.01em', color: accent, margin: 0 }}>SALARY SLIP</p>
            <p style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>{fmtMonth(month.payroll_month)}</p>
          </div>
        </div>

        {/* Meta */}
        <div style={{ display: 'flex', gap: '40px', marginBottom: '30px' }}>
          <div style={{ flex: 1 }}>
            <p style={LBL}>EMPLOYEE</p>
            <p style={{ fontSize: '13px', fontWeight: 700, color: '#111', margin: 0 }}>{employee.name}</p>
            <p style={{ fontSize: '10.5px', color: '#888', marginTop: '2px', lineHeight: 1.5 }}>
              {employee.designation ?? '—'} · {employee.employee_id}
              {employee.pan_number && <><br />PAN {employee.pan_number}</>}
              {employee.joining_date && <><br />Joined {fmtDate(employee.joining_date)}</>}
            </p>
          </div>
          <div>
            <p style={LBL}>PAID TO</p>
            <p style={{ fontSize: '11px', color: '#333', lineHeight: 1.6, margin: 0, ...numSt }}>
              {employee.bank_name ?? '—'}
              {employee.account_number && <><br />A/C {employee.account_number}</>}
              {employee.ifsc && <><br />IFSC {employee.ifsc}</>}
            </p>
            <p style={{ ...LBL, margin: '10px 0 5px' }}>PAID ON</p>
            <p style={{ fontSize: '11px', color: '#333', margin: 0 }}>{fmtDate(month.payment_date)}</p>
          </div>
        </div>

        {/* Earnings / Deductions */}
        <div style={{ display: 'flex', gap: '36px' }}>
          <div style={{ flex: 1 }}>
            <div style={colHead}><span>EARNINGS</span><span style={{ textAlign: 'right' }}>₹</span></div>
            {earnings.map(([l, v]) => (
              <div key={l} style={rowSt}><span>{l}</span><span style={{ textAlign: 'right', ...numSt }}>{cell(v)}</span></div>
            ))}
            <div style={totSt}><span>Gross</span><span style={{ textAlign: 'right', ...numSt }}>{fmtInr(gross)}</span></div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={colHead}><span>DEDUCTIONS</span><span style={{ textAlign: 'right' }}>₹</span></div>
            {deductions.map(([l, v]) => (
              <div key={l} style={rowSt}><span>{l}</span><span style={{ textAlign: 'right', ...numSt }}>{cell(v)}</span></div>
            ))}
            <div style={totSt}><span>Total</span><span style={{ textAlign: 'right', ...numSt }}>{fmtInr(totalDed)}</span></div>
          </div>
        </div>

        {/* Net Pay */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
          <div style={{ width: '280px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '14px 0 0', borderTop: '2px solid #111' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '.06em', color: '#111' }}>NET PAY</span>
            <span style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-.02em', color: accent, ...numSt }}>₹{fmtInr(net)}</span>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '7px' }}>
          <p style={{ width: '280px', fontSize: '10px', color: '#888', textAlign: 'right', margin: 0 }}>{amountToWords(net, 'INR')}</p>
        </div>

        {/* Footer — source salary + FX rate (existing fields) */}
        <div style={{ marginTop: '40px', paddingTop: '16px', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
          <p style={{ fontSize: '9.5px', color: '#aaa', lineHeight: 1.6, margin: 0, ...numSt }}>
            Salary {fmtInr(num(entry.salary_amount))} {employee.salary_currency || 'EUR'}
            {num(entry.expended_rate) > 0 && <><br />Exchange rate ₹{fmtInr(num(entry.expended_rate))}</>}
          </p>
          {signatureUrl
            ? (
              <div style={{ textAlign: 'right' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={signatureUrl} alt="Authorised Signature" style={{ height: '2cm', width: 'auto', maxWidth: '5.5cm', objectFit: 'contain', display: 'block', marginLeft: 'auto' }} />
                <p style={{ fontSize: '9.5px', color: '#aaa', margin: '4px 0 0' }}>Authorised Signatory</p>
              </div>
            )
            : <p style={{ fontSize: '9.5px', color: '#aaa', textAlign: 'right', margin: 0 }}>Computer-generated slip<br />No signature required</p>}
        </div>
        </div>
      </div>
    </div>
  )
}
