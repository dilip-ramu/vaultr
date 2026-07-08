'use client'

import { amountToWords } from '@/lib/recoverables/invoices/words'
import type { RecoverableInvoice, RecoverableInvoiceLine } from '@/lib/recoverables/types'
import {
  type InvoiceTemplate,
  DEFAULT_INVOICE_TEMPLATE, DEFAULT_INVOICE_ACCENT, accentSoft,
} from '@/lib/companies/templates'

export interface InvoiceDocSettings {
  company_name: string | null
  company_address: string | null
  company_gstin: string | null
  company_phone: string | null
  company_email: string | null
  bank_account_name: string | null
  bank_account_number: string | null
  bank_ifsc: string | null
  bank_name: string | null
  swift_code: string | null
  terms_conditions: string | null
  hsn_sac: string | null
}

interface Props {
  invoice: RecoverableInvoice
  lines: RecoverableInvoiceLine[]
  settings: InvoiceDocSettings | null
  logoUrl?: string | null
  signatureUrl?: string | null
  template?: InvoiceTemplate
  accent?: string
  /** Preview mode: reflow the A4 sheet to fill its container (for on-screen
   *  editing) instead of a fixed 210mm page. */
  preview?: boolean
}

function fmtInr(n: number, dp = 2) {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(n)
}
function fmtDate(d: string | null) { return d ?? '—' }
function fmtDateLong(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const paymentTermsLabel: Record<string, string> = {
  net_7: 'Net 7', net_15: 'Net 15', net_30: 'Net 30',
  net_60: 'Net 60', net_90: 'Net 90', due_on_receipt: 'Due on Receipt',
}

/** The invoice document itself — all three templates, style-scoped under
 *  `.vinv` so it can render on the isolated print route AND embedded in the
 *  app (live preview) without leaking styles. The print chrome (button, page
 *  background) lives in InvoicePrintView, which wraps this. */
export default function InvoiceDocument({
  invoice, lines, settings,
  logoUrl = null, signatureUrl = null,
  template = DEFAULT_INVOICE_TEMPLATE,
  accent = DEFAULT_INVOICE_ACCENT,
  preview = false,
}: Props) {
  const companyName = settings?.company_name ?? 'Your Company'
  const balanceDue  = invoice.balance_due
  const termsLabel  = paymentTermsLabel[invoice.payment_terms ?? ''] ?? (invoice.payment_terms ?? '—')
  const stateDisplay = invoice.customer_state ? invoice.customer_state : null

  const uniformCgst = lines.length > 0 && lines.every(l => l.cgst_rate === lines[0].cgst_rate)
  const uniformSgst = lines.length > 0 && lines.every(l => l.sgst_rate === lines[0].sgst_rate)

  const sheetStyle = {
    ['--accent' as string]: accent,
    ['--accent-soft' as string]: accentSoft(accent),
  } as React.CSSProperties

  // ── Claude design (frame 16a) — future invoices only ─────────────────────
  // Same per-company data (logo, address, GSTIN, bank) + the company accent
  // for the grand total. Only the layout schema is from the Claude design.
  if (invoice.design_version === 'claude') {
    const isPaid = invoice.status === 'paid'
    const pill = isPaid
      ? { text: 'PAID', color: '#14532D', bg: '#DCFCE7' }
      : { text: `DUE · ${termsLabel.toUpperCase()}`, color: '#B4530F', bg: '#FBEEDD' }
    const LBL: React.CSSProperties = { fontSize: '9px', fontWeight: 800, letterSpacing: '.1em', color: '#aaa', margin: '0 0 5px' }
    const numSt: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' }
    const totRow = (label: string, val: string) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '11.5px', color: '#666' }}>
        <span>{label}</span><span style={numSt}>{val}</span>
      </div>
    )
    return (
      <div className="vinv-claude" style={{ background: preview ? 'transparent' : '#e5e7eb', padding: preview ? 0 : '32px 0', display: 'flex', justifyContent: 'center' }}>
        <div style={{
          width: preview ? '100%' : '210mm', minHeight: preview ? 'auto' : '297mm',
          background: '#fff', color: '#111', fontFamily: "'Manrope', system-ui, sans-serif",
          padding: preview ? '32px 34px' : '48px 44px', borderRadius: preview ? '10px' : '2px',
          boxShadow: preview ? 'none' : '0 12px 40px rgba(0,0,0,.16)',
          WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '36px' }}>
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logoUrl && <img src={logoUrl} alt="" style={{ height: '28px', width: 'auto', objectFit: 'contain', marginBottom: '14px' }} />}
              <p style={{ fontSize: '11px', color: '#888', lineHeight: 1.55, margin: 0 }}>
                <span style={{ fontWeight: 700, color: '#333' }}>{companyName}</span>
                {settings?.company_address && <><br />{settings.company_address}</>}
                {settings?.company_gstin && <><br />GSTIN {settings.company_gstin}</>}
                {settings?.company_phone && <><br />{settings.company_phone}</>}
                {settings?.company_email && <><br />{settings.company_email}</>}
              </p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-.02em', color: '#111', margin: 0 }}>Tax Invoice</p>
              <p style={{ fontSize: '12px', color: '#888', marginTop: '2px', ...numSt }}>{invoice.invoice_number}</p>
              <span style={{ display: 'inline-block', marginTop: '12px', fontSize: '10px', fontWeight: 700, color: pill.color, background: pill.bg, padding: '4px 11px', borderRadius: '20px' }}>{pill.text}</span>
            </div>
          </div>
          {/* Meta */}
          <div style={{ display: 'flex', gap: '40px', marginBottom: '30px' }}>
            <div style={{ flex: 1 }}>
              <p style={LBL}>BILLED TO</p>
              <p style={{ fontSize: '13px', fontWeight: 700, color: '#111', margin: 0 }}>{invoice.customer_name}</p>
              {(invoice.customer_address || invoice.customer_gstin) && (
                <p style={{ fontSize: '10.5px', color: '#888', marginTop: '2px', lineHeight: 1.5 }}>
                  {invoice.customer_address}
                  {invoice.customer_address && invoice.customer_gstin && <br />}
                  {invoice.customer_gstin}
                </p>
              )}
            </div>
            <div>
              <p style={LBL}>ISSUED</p>
              <p style={{ fontSize: '12px', color: '#333', margin: 0 }}>{fmtDateLong(invoice.invoice_date)}</p>
              <p style={{ ...LBL, margin: '10px 0 5px' }}>DUE</p>
              <p style={{ fontSize: '12px', color: '#333', margin: 0 }}>{fmtDateLong(invoice.due_date)}</p>
            </div>
          </div>
          {/* Place of supply / ship-to */}
          {(invoice.customer_gstin || stateDisplay) && (
            <div style={{ display: 'flex', gap: '28px', fontSize: '10px', color: '#888', marginBottom: '14px' }}>
              {invoice.customer_gstin && <span>Ship-to GSTIN: <span style={{ color: '#333' }}>{invoice.customer_gstin}</span></span>}
              {stateDisplay && <span>Place of Supply: <span style={{ color: '#333' }}>{stateDisplay}</span></span>}
            </div>
          )}
          {/* Line table */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '0 18px', fontSize: '9px', fontWeight: 800, letterSpacing: '.08em', color: '#aaa', paddingBottom: '8px', borderBottom: '1px solid #eee' }}>
            <span>DESCRIPTION</span><span style={{ textAlign: 'right' }}>QTY</span><span style={{ textAlign: 'right' }}>RATE</span><span style={{ textAlign: 'right' }}>AMOUNT</span>
          </div>
          {lines.map(l => (
            <div key={l.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: '0 18px', fontSize: '11.5px', color: '#222', padding: '12px 0', borderBottom: '1px solid #f2f2f2' }}>
              <span>
                {l.description || l.awb}
                <span style={{ display: 'block', fontSize: '9px', color: '#aaa', marginTop: '2px' }}>
                  HSN/SAC {l.hsn_sac ?? settings?.hsn_sac ?? '996812'}
                  {(l.cgst_rate > 0 || l.sgst_rate > 0) && ` · CGST ${l.cgst_rate}% · SGST ${l.sgst_rate}%`}
                </span>
              </span>
              <span style={{ textAlign: 'right', ...numSt }}>{l.qty || ''}</span>
              <span style={{ textAlign: 'right', ...numSt }}>{l.rate ? fmtInr(l.rate, 2) : ''}</span>
              <span style={{ textAlign: 'right', fontWeight: 600, ...numSt }}>{fmtInr(l.amount)}</span>
            </div>
          ))}
          {/* Totals */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '28px' }}>
            <div style={{ width: '260px' }}>
              {totRow('Subtotal', `₹${fmtInr(invoice.subtotal)}`)}
              {invoice.cgst_amount > 0 && totRow(`CGST${uniformCgst ? ` ${lines[0].cgst_rate}%` : ''}`, `₹${fmtInr(invoice.cgst_amount)}`)}
              {invoice.sgst_amount > 0 && totRow(`SGST${uniformSgst ? ` ${lines[0].sgst_rate}%` : ''}`, `₹${fmtInr(invoice.sgst_amount)}`)}
              {totRow('Total', `₹${fmtInr(invoice.total)}`)}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '14px 0 0', marginTop: '8px', borderTop: '2px solid #111' }}>
                <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '.06em', color: '#111' }}>BALANCE DUE</span>
                <span style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-.02em', color: accent, ...numSt }}>₹{fmtInr(balanceDue)}</span>
              </div>
            </div>
          </div>
          {/* Amount in words */}
          <div style={{ marginTop: '18px', fontSize: '10.5px', color: '#666' }}>
            Total in words: <span style={{ color: '#111', fontWeight: 600 }}>{amountToWords(invoice.total, invoice.currency ?? 'INR')}</span>
          </div>
          {/* Bank details + Terms */}
          {(settings?.bank_account_number || settings?.terms_conditions) && (
            <div style={{ display: 'flex', gap: '40px', marginTop: '22px', paddingTop: '18px', borderTop: '1px solid #eee' }}>
              {settings?.bank_account_number && (
                <div style={{ flex: 1 }}>
                  <p style={LBL}>BANK DETAILS</p>
                  <p style={{ fontSize: '10.5px', color: '#444', lineHeight: 1.7, margin: 0 }}>
                    {settings.bank_account_name && <>{settings.bank_account_name}<br /></>}
                    A/C {settings.bank_account_number}<br />
                    {settings.bank_ifsc && <>IFSC {settings.bank_ifsc}<br /></>}
                    {settings.swift_code && <>SWIFT {settings.swift_code}<br /></>}
                    {settings.bank_name && <>{settings.bank_name}</>}
                  </p>
                </div>
              )}
              {settings?.terms_conditions && (
                <div style={{ flex: 1 }}>
                  <p style={LBL}>TERMS &amp; CONDITIONS</p>
                  <p style={{ fontSize: '10px', color: '#666', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>{settings.terms_conditions}</p>
                </div>
              )}
            </div>
          )}
          {/* Authorised signature */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '30px' }}>
            <div style={{ textAlign: 'right' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {signatureUrl
                ? <img src={signatureUrl} alt="Authorised Signature" style={{ height: '2.4cm', width: 'auto', display: 'block', marginLeft: 'auto' }} />
                : <div style={{ height: '2.2cm', width: '4.5cm', borderBottom: '1px solid #ccc', marginLeft: 'auto' }} />}
              <p style={{ fontSize: '10px', color: '#888', margin: '5px 0 0' }}>Authorised Signature<br /><span style={{ color: '#bbb' }}>for {companyName}</span></p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const CompanyInfo = (
    <div className="company-info">
      <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '3px' }}>{companyName}</div>
      {settings?.company_address && <div style={{ whiteSpace: 'pre-wrap' }}>{settings.company_address}</div>}
      {settings?.company_gstin   && <div>GSTIN: {settings.company_gstin}</div>}
      {settings?.company_phone   && <div>Phone: {settings.company_phone}</div>}
      {settings?.company_email   && <div>Email: {settings.company_email}</div>}
    </div>
  )
  const MetaTable = (
    <table className="meta-table">
      <tbody>
        <tr><td>Invoice Date</td><td>{fmtDateLong(invoice.invoice_date)}</td></tr>
        <tr><td>Terms</td><td>{termsLabel}</td></tr>
        <tr><td>Due Date</td><td>{fmtDateLong(invoice.due_date)}</td></tr>
      </tbody>
    </table>
  )
  const BillTo = (
    <div className="bill-to-block">
      <div className="section-label">Bill To</div>
      <div className="customer-name">{invoice.customer_name}</div>
      {invoice.customer_address && <div className="customer-address">{invoice.customer_address}</div>}
      {invoice.customer_gstin && <div className="customer-gstin">GSTIN: {invoice.customer_gstin}</div>}
    </div>
  )

  return (
    <div className="vinv">
      <style>{`
        .vinv *, .vinv *::before, .vinv *::after { box-sizing: border-box; }
        .vinv .sheet { background: #fff; width: 210mm; min-height: 297mm; margin: 32px auto; padding: 12mm 14mm; box-shadow: 0 4px 24px rgba(0,0,0,.15); color: #000; font-size: 11px; line-height: 1.4; font-family: system-ui, -apple-system, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .vinv .sheet--preview { width: 100%; min-height: auto; margin: 0; box-shadow: none; padding: 20px 22px; border-radius: 10px; }

        .vinv .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
        .vinv .tax-invoice-block { text-align: right; }
        .vinv .tax-invoice-block h2 { font-size: 16px; font-weight: 700; margin: 0 0 2px; }
        .vinv .tpl-classic .tax-invoice-block h2 { color: var(--accent); }
        .vinv .invoice-number { font-size: 13px; font-weight: 600; color: #374151; }

        .vinv .subheader { display: flex; justify-content: space-between; align-items: flex-start; padding: 6px 0 8px; border-top: 1px solid #000; border-bottom: 1px solid #000; margin-bottom: 10px; }
        .vinv .company-info { font-size: 10.5px; line-height: 1.5; }
        .vinv .balance-block { text-align: right; }
        .vinv .balance-label { font-size: 10px; color: #6b7280; margin-bottom: 2px; }
        .vinv .balance-amount { font-size: 22px; font-weight: 700; }
        .vinv .tpl-classic .balance-amount { color: var(--accent); }

        .vinv .parties-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; gap: 16px; }
        .vinv .bill-to-block { flex: 1; }
        .vinv .section-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; margin-bottom: 3px; }
        .vinv .customer-name { font-size: 13px; font-weight: 700; }
        .vinv .customer-address { font-size: 10px; color: #374151; margin-top: 2px; white-space: pre-wrap; }
        .vinv .customer-gstin { font-size: 10px; margin-top: 3px; }

        .vinv .meta-table { font-size: 10.5px; border-collapse: collapse; }
        .vinv .meta-table td { padding: 2px 4px; }
        .vinv .meta-table td:first-child { color: #6b7280; white-space: nowrap; padding-right: 12px; }
        .vinv .meta-table td:last-child { font-weight: 600; text-align: right; }

        .vinv .supply-line { font-size: 10.5px; margin-bottom: 10px; padding: 4px 0; border-top: 1px solid #d1d5db; border-bottom: 1px solid #d1d5db; }

        .vinv .brand-band { background: var(--accent); color: #fff; border-radius: 6px; padding: 12px 14px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-start; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .vinv .brand-band .bn-name { font-size: 18px; font-weight: 700; }
        .vinv .brand-band .bn-logo { height: 1.2cm; width: auto; background: #fff; border-radius: 4px; padding: 3px 5px; margin-bottom: 6px; display: block; }
        .vinv .brand-band .bn-right { text-align: right; }
        .vinv .brand-band .bn-title { font-size: 14px; font-weight: 700; letter-spacing: .04em; }
        .vinv .brand-band .bn-num { font-size: 11px; opacity: .95; }
        .vinv .brand-band .bn-bal-label { font-size: 9px; opacity: .85; margin-top: 6px; }
        .vinv .brand-band .bn-bal { font-size: 16px; font-weight: 700; }
        .vinv .soft-box { background: var(--accent-soft); border-radius: 6px; padding: 8px 10px; flex: 1; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

        .vinv .minimal-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
        .vinv .minimal-name { font-size: 18px; font-weight: 700; color: var(--accent); display: inline-block; border-bottom: 2px solid var(--accent); padding-bottom: 2px; }
        .vinv .minimal-sub { font-size: 10px; color: #374151; margin-top: 6px; line-height: 1.5; }
        .vinv .minimal-right { text-align: right; }
        .vinv .minimal-right .mr-title { font-size: 13px; font-weight: 700; color: var(--accent); }
        .vinv .minimal-right .mr-num { font-size: 11px; color: #6b7280; margin-top: 2px; }

        .vinv .items-table { width: 100%; border-collapse: collapse; margin-bottom: 0; font-size: 10.5px; }
        .vinv .items-table th { background: #f3f4f6; font-weight: 700; padding: 5px 6px; text-align: left; border: 1px solid #d1d5db; }
        .vinv .items-table th.right, .vinv .items-table td.right { text-align: right; }
        .vinv .items-table td { padding: 4px 6px; border: 1px solid #d1d5db; vertical-align: top; }
        .vinv .items-table tr:nth-child(even) td { background: #f9fafb; }
        .vinv .awb-cell { font-family: monospace; font-size: 9.5px; color: #374151; }
        .vinv .items-table.tpl-modern th { background: var(--accent); color: #fff; border-color: var(--accent); }
        .vinv .items-table.tpl-minimal th { background: transparent; border-left: none; border-right: none; border-top: none; border-bottom: 1.5px solid var(--accent); }
        .vinv .items-table.tpl-minimal td { border-left: none; border-right: none; }
        .vinv .items-table.tpl-minimal tr:nth-child(even) td { background: transparent; }

        .vinv .totals-section { display: flex; justify-content: flex-end; margin-top: 0; border-left: 1px solid #d1d5db; border-right: 1px solid #d1d5db; border-bottom: 1px solid #d1d5db; }
        .vinv .totals-section.tpl-minimal { border: none; }
        .vinv .totals-table { font-size: 10.5px; border-collapse: collapse; min-width: 200px; }
        .vinv .totals-table td { padding: 3px 8px; }
        .vinv .totals-table td:first-child { color: #374151; }
        .vinv .totals-table td:last-child { text-align: right; font-weight: 500; min-width: 80px; }
        .vinv .totals-table tr.total-row td { font-weight: 700; font-size: 12px; border-top: 1px solid #000; padding-top: 5px; }
        .vinv .totals-table tr.total-row td:last-child { color: var(--accent); }
        .vinv .totals-table tr.balance-row td { font-weight: 700; font-size: 14px; }
        .vinv .totals-table tr.balance-row td:last-child { color: var(--accent); }

        .vinv .words-row { border: 1px solid #d1d5db; border-top: none; padding: 5px 8px; font-size: 10px; }
        .vinv .tpl-minimal .words-row { border: none; padding: 5px 0; }
        .vinv .words-row span { font-weight: 600; }

        .vinv .footer-row { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 12px; gap: 16px; }
        .vinv .bank-block { flex: 1; }
        .vinv .bank-block h4, .vinv .terms-block h4 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; margin: 0 0 4px; }
        .vinv .bank-table { font-size: 10.5px; border-collapse: collapse; }
        .vinv .bank-table td { padding: 1.5px 0; }
        .vinv .bank-table td:first-child { color: #6b7280; min-width: 110px; }
        .vinv .terms-block { flex: 1; font-size: 10px; line-height: 1.5; white-space: pre-wrap; }

        @media print {
          .vinv .sheet { margin: 0; box-shadow: none; width: 100%; padding: 10mm 12mm; }
        }
      `}</style>

      <div className={`sheet tpl-${template}${preview ? ' sheet--preview' : ''}`} style={sheetStyle}>

        {template === 'modern' ? (
          <>
            <div className="brand-band">
              <div>
                {logoUrl && <img className="bn-logo" src={logoUrl} alt={companyName} />}
                <div className="bn-name">{companyName}</div>
              </div>
              <div className="bn-right">
                <div className="bn-title">TAX INVOICE</div>
                <div className="bn-num"># {invoice.invoice_number}</div>
                <div className="bn-bal-label">Balance Due</div>
                <div className="bn-bal">₹{fmtInr(balanceDue)}</div>
              </div>
            </div>
            <div className="parties-row">
              <div className="soft-box"><div className="section-label">From</div>{CompanyInfo}</div>
              <div className="soft-box">{BillTo}{MetaTable}</div>
            </div>
          </>
        ) : template === 'minimal' ? (
          <>
            <div className="minimal-head">
              <div>
                <span className="minimal-name">{companyName}</span>
                <div className="minimal-sub">
                  {settings?.company_address && <div style={{ whiteSpace: 'pre-wrap' }}>{settings.company_address}</div>}
                  {settings?.company_gstin   && <div>GSTIN: {settings.company_gstin}</div>}
                  {settings?.company_email   && <div>{settings.company_email}</div>}
                </div>
              </div>
              <div className="minimal-right">
                <div className="mr-title">Tax Invoice</div>
                <div className="mr-num"># {invoice.invoice_number}</div>
                <div className="mr-num" style={{ marginTop: '6px' }}>Balance Due</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--accent)' }}>₹{fmtInr(balanceDue)}</div>
              </div>
            </div>
            <div className="parties-row">{BillTo}{MetaTable}</div>
          </>
        ) : (
          <>
            <div className="header">
              {logoUrl
                ? <img src={logoUrl} alt={companyName} style={{ height: '1.5cm', width: 'auto', display: 'block' }} />
                : <div style={{ height: '1.5cm' }} />}
              <div className="tax-invoice-block">
                <h2>Tax Invoice</h2>
                <div className="invoice-number"># {invoice.invoice_number}</div>
              </div>
            </div>
            <div className="subheader">
              {CompanyInfo}
              <div className="balance-block">
                <div className="balance-label">Balance Due</div>
                <div className="balance-amount">₹{fmtInr(balanceDue)}</div>
              </div>
            </div>
            <div className="parties-row">{BillTo}{MetaTable}</div>
          </>
        )}

        {(invoice.customer_gstin || stateDisplay) && (
          <div className="supply-line">
            {invoice.customer_gstin && <span>Ship To GSTIN: {invoice.customer_gstin}&nbsp;&nbsp;</span>}
            {stateDisplay && <span>Place Of Supply: {stateDisplay}</span>}
          </div>
        )}

        <table className={`items-table tpl-${template}`}>
          <thead>
            <tr>
              <th style={{ width: '28px' }}>#</th>
              <th>Item &amp; Description</th>
              <th style={{ width: '52px' }}>HSN/SAC</th>
              <th className="right" style={{ width: '36px' }}>Qty</th>
              <th className="right" style={{ width: '62px' }}>Rate</th>
              <th className="right" style={{ width: '64px' }}>CGST</th>
              <th className="right" style={{ width: '64px' }}>SGST</th>
              <th className="right" style={{ width: '72px' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(line => (
              <tr key={line.id}>
                <td>{line.line_number}</td>
                <td>
                  {line.description
                    ? <div style={{ fontWeight: 600 }}>{line.description}</div>
                    : <>
                        <div>{fmtDate(line.shipment_date)}</div>
                        {line.client_name && <div style={{ fontWeight: 600 }}>Consignee: {line.client_name}</div>}
                        <div className="awb-cell">AWB: {line.awb}</div>
                      </>}
                </td>
                <td>{line.hsn_sac ?? settings?.hsn_sac ?? '996812'}</td>
                <td className="right">{line.qty}</td>
                <td className="right">{fmtInr(line.rate, 2)}</td>
                <td className="right">
                  <div>{fmtInr(line.qty > 0 ? line.cgst_amount / line.qty : 0)}</div>
                  <div style={{ color: '#6b7280', fontSize: '9px' }}>{line.cgst_rate}%</div>
                </td>
                <td className="right">
                  <div>{fmtInr(line.qty > 0 ? line.sgst_amount / line.qty : 0)}</div>
                  <div style={{ color: '#6b7280', fontSize: '9px' }}>{line.sgst_rate}%</div>
                </td>
                <td className="right">{fmtInr(line.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className={`totals-section tpl-${template}`}>
          <table className="totals-table">
            <tbody>
              <tr><td>Sub Total</td><td>{fmtInr(invoice.subtotal)}</td></tr>
              <tr><td>CGST{uniformCgst ? ` (${lines[0].cgst_rate}%)` : ''}</td><td>{fmtInr(invoice.cgst_amount)}</td></tr>
              <tr><td>SGST{uniformSgst ? ` (${lines[0].sgst_rate}%)` : ''}</td><td>{fmtInr(invoice.sgst_amount)}</td></tr>
              <tr className="total-row"><td>Total</td><td>₹{fmtInr(invoice.total)}</td></tr>
              <tr className="balance-row"><td>Balance Due</td><td>₹{fmtInr(balanceDue)}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="words-row">
          Total In Words: <span>{amountToWords(invoice.total, invoice.currency ?? 'INR')}</span>
        </div>

        {(settings?.bank_account_number || settings?.terms_conditions) && (
          <div className="footer-row">
            {settings?.bank_account_number && (
              <div className="bank-block">
                <h4>Bank Details</h4>
                <table className="bank-table">
                  <tbody>
                    {settings.bank_account_name   && <tr><td>Account Name</td><td>{settings.bank_account_name}</td></tr>}
                    {settings.bank_account_number && <tr><td>Account Number</td><td>{settings.bank_account_number}</td></tr>}
                    {settings.bank_ifsc           && <tr><td>IFSC Code</td><td>{settings.bank_ifsc}</td></tr>}
                    {settings.swift_code          && <tr><td>SWIFT / BIC</td><td>{settings.swift_code}</td></tr>}
                    {settings.bank_name           && <tr><td>Bank Name</td><td>{settings.bank_name}</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
            {settings?.terms_conditions && (
              <div className="terms-block">
                <h4>Terms &amp; Conditions</h4>
                {settings.terms_conditions}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
          <div style={{ textAlign: 'right' }}>
            {signatureUrl
              ? <img src={signatureUrl} alt="Authorised Signature" style={{ height: '3cm', width: 'auto', display: 'block', marginLeft: 'auto' }} />
              : <div style={{ height: '3cm', width: '5cm', borderBottom: '1px solid #999', marginLeft: 'auto' }} />}
            <div style={{ fontSize: '10.5px', marginTop: '4px' }}>Authorised Signature</div>
          </div>
        </div>

      </div>
    </div>
  )
}
