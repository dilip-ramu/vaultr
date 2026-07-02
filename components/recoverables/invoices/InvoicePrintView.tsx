'use client'

import { amountToWords } from '@/lib/recoverables/invoices/words'
import type { RecoverableInvoice, RecoverableInvoiceLine } from '@/lib/recoverables/types'
import {
  type InvoiceTemplate,
  DEFAULT_INVOICE_TEMPLATE, DEFAULT_INVOICE_ACCENT, accentSoft,
} from '@/lib/companies/templates'

interface InvoiceSettings {
  company_name: string | null
  company_address: string | null
  company_gstin: string | null
  company_phone: string | null
  company_email: string | null
  bank_account_name: string | null
  bank_account_number: string | null
  bank_ifsc: string | null
  bank_name: string | null
  /** v64 — SWIFT/BIC code for foreign transfers. */
  swift_code: string | null
  terms_conditions: string | null
  hsn_sac: string | null
}

interface Props {
  invoice: RecoverableInvoice
  lines: RecoverableInvoiceLine[]
  settings: InvoiceSettings | null
  /** Logo URL — public URL for company logos, signed URL for the legacy one. */
  logoUrl?: string | null
  /** Signed URL to the authorised signature image (private bucket). */
  signatureUrl?: string | null
  /** v69 — per-company layout + accent (Feature 1). */
  template?: InvoiceTemplate
  accent?: string
}

function fmtInr(n: number, dp = 2) {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  }).format(n)
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return d
}

function fmtDateLong(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const paymentTermsLabel: Record<string, string> = {
  net_7: 'Net 7', net_15: 'Net 15', net_30: 'Net 30',
  net_60: 'Net 60', net_90: 'Net 90', due_on_receipt: 'Due on Receipt',
}

export default function InvoicePrintView({
  invoice, lines, settings,
  logoUrl = null, signatureUrl = null,
  template = DEFAULT_INVOICE_TEMPLATE,
  accent = DEFAULT_INVOICE_ACCENT,
}: Props) {
  const companyName  = settings?.company_name  ?? 'Your Company'
  const balanceDue   = invoice.balance_due
  const termsLabel   = paymentTermsLabel[invoice.payment_terms ?? ''] ?? (invoice.payment_terms ?? '—')

  const stateDisplay = invoice.customer_state ? invoice.customer_state : null

  // Show a single "(x%)" in the tax totals only when every line shares one
  // rate. A mixed-rate invoice drops the rate from the label — the per-line
  // rate is already printed in each row of the items table.
  const uniformCgst = lines.length > 0 && lines.every(l => l.cgst_rate === lines[0].cgst_rate)
  const uniformSgst = lines.length > 0 && lines.every(l => l.sgst_rate === lines[0].sgst_rate)

  const sheetStyle = {
    ['--accent' as string]: accent,
    ['--accent-soft' as string]: accentSoft(accent),
  } as React.CSSProperties

  // ── Shared fragments ───────────────────────────────────────────────────────
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
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #e5e7eb; }

        .print-btn { position: fixed; top: 16px; right: 16px; z-index: 100; background: var(--accent); color: #fff; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
        .print-btn:hover { filter: brightness(0.92); }

        .sheet { background: #fff; width: 210mm; min-height: 297mm; margin: 32px auto; padding: 12mm 14mm; box-shadow: 0 4px 24px rgba(0,0,0,.15); color: #000; font-size: 11px; line-height: 1.4; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
        .tax-invoice-block { text-align: right; }
        .tax-invoice-block h2 { font-size: 16px; font-weight: 700; margin: 0 0 2px; }
        .tpl-classic .tax-invoice-block h2 { color: var(--accent); }
        .invoice-number { font-size: 13px; font-weight: 600; color: #374151; }

        .subheader { display: flex; justify-content: space-between; align-items: flex-start; padding: 6px 0 8px; border-top: 1px solid #000; border-bottom: 1px solid #000; margin-bottom: 10px; }
        .company-info { font-size: 10.5px; line-height: 1.5; }
        .balance-block { text-align: right; }
        .balance-label { font-size: 10px; color: #6b7280; margin-bottom: 2px; }
        .balance-amount { font-size: 22px; font-weight: 700; }
        .tpl-classic .balance-amount { color: var(--accent); }

        .parties-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; gap: 16px; }
        .bill-to-block { flex: 1; }
        .section-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; margin-bottom: 3px; }
        .customer-name { font-size: 13px; font-weight: 700; }
        .customer-address { font-size: 10px; color: #374151; margin-top: 2px; white-space: pre-wrap; }
        .customer-gstin { font-size: 10px; margin-top: 3px; }

        .meta-table { font-size: 10.5px; border-collapse: collapse; }
        .meta-table td { padding: 2px 4px; }
        .meta-table td:first-child { color: #6b7280; white-space: nowrap; padding-right: 12px; }
        .meta-table td:last-child { font-weight: 600; text-align: right; }

        .supply-line { font-size: 10.5px; margin-bottom: 10px; padding: 4px 0; border-top: 1px solid #d1d5db; border-bottom: 1px solid #d1d5db; }

        /* ── Modern band ── */
        .brand-band { background: var(--accent); color: #fff; border-radius: 6px; padding: 12px 14px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-start; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .brand-band .bn-name { font-size: 18px; font-weight: 700; }
        .brand-band .bn-logo { height: 1.2cm; width: auto; background: #fff; border-radius: 4px; padding: 3px 5px; margin-bottom: 6px; display: block; }
        .brand-band .bn-right { text-align: right; }
        .brand-band .bn-title { font-size: 14px; font-weight: 700; letter-spacing: .04em; }
        .brand-band .bn-num { font-size: 11px; opacity: .95; }
        .brand-band .bn-bal-label { font-size: 9px; opacity: .85; margin-top: 6px; }
        .brand-band .bn-bal { font-size: 16px; font-weight: 700; }
        .soft-box { background: var(--accent-soft); border-radius: 6px; padding: 8px 10px; flex: 1; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

        /* ── Minimal head ── */
        .minimal-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
        .minimal-name { font-size: 18px; font-weight: 700; color: var(--accent); display: inline-block; border-bottom: 2px solid var(--accent); padding-bottom: 2px; }
        .minimal-sub { font-size: 10px; color: #374151; margin-top: 6px; line-height: 1.5; }
        .minimal-right { text-align: right; }
        .minimal-right .mr-title { font-size: 13px; font-weight: 700; color: var(--accent); }
        .minimal-right .mr-num { font-size: 11px; color: #6b7280; margin-top: 2px; }

        /* ── Line items ── */
        .items-table { width: 100%; border-collapse: collapse; margin-bottom: 0; font-size: 10.5px; }
        .items-table th { background: #f3f4f6; font-weight: 700; padding: 5px 6px; text-align: left; border: 1px solid #d1d5db; }
        .items-table th.right, .items-table td.right { text-align: right; }
        .items-table td { padding: 4px 6px; border: 1px solid #d1d5db; vertical-align: top; }
        .items-table tr:nth-child(even) td { background: #f9fafb; }
        .awb-cell { font-family: monospace; font-size: 9.5px; color: #374151; }

        .items-table.tpl-modern th { background: var(--accent); color: #fff; border-color: var(--accent); }
        .items-table.tpl-minimal th { background: transparent; border-left: none; border-right: none; border-top: none; border-bottom: 1.5px solid var(--accent); }
        .items-table.tpl-minimal td { border-left: none; border-right: none; }
        .items-table.tpl-minimal tr:nth-child(even) td { background: transparent; }

        /* ── Totals ── */
        .totals-section { display: flex; justify-content: flex-end; margin-top: 0; border-left: 1px solid #d1d5db; border-right: 1px solid #d1d5db; border-bottom: 1px solid #d1d5db; }
        .totals-section.tpl-minimal { border: none; }
        .totals-table { font-size: 10.5px; border-collapse: collapse; min-width: 200px; }
        .totals-table td { padding: 3px 8px; }
        .totals-table td:first-child { color: #374151; }
        .totals-table td:last-child { text-align: right; font-weight: 500; min-width: 80px; }
        .totals-table tr.total-row td { font-weight: 700; font-size: 12px; border-top: 1px solid #000; padding-top: 5px; }
        .totals-table tr.total-row td:last-child { color: var(--accent); }
        .totals-table tr.balance-row td { font-weight: 700; font-size: 14px; }
        .totals-table tr.balance-row td:last-child { color: var(--accent); }

        .words-row { border: 1px solid #d1d5db; border-top: none; padding: 5px 8px; font-size: 10px; }
        .tpl-minimal .words-row { border: none; padding: 5px 0; }
        .words-row span { font-weight: 600; }

        .footer-row { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 12px; gap: 16px; }
        .bank-block { flex: 1; }
        .bank-block h4, .terms-block h4 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; margin: 0 0 4px; }
        .bank-table { font-size: 10.5px; border-collapse: collapse; }
        .bank-table td { padding: 1.5px 0; }
        .bank-table td:first-child { color: #6b7280; min-width: 110px; }
        .terms-block { flex: 1; font-size: 10px; line-height: 1.5; white-space: pre-wrap; }

        @media print {
          .print-btn { display: none !important; }
          body { background: #fff; }
          .sheet { margin: 0; box-shadow: none; width: 100%; padding: 10mm 12mm; }
        }
      `}</style>

      <button className="print-btn" onClick={() => window.print()}>
        Print / Download PDF
      </button>

      <div className={`sheet tpl-${template}`} style={sheetStyle}>

        {/* ── Header (per template) ── */}
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
              <div className="soft-box">
                <div className="section-label">From</div>
                {CompanyInfo}
              </div>
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
            <div className="parties-row">
              {BillTo}
              {MetaTable}
            </div>
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
            <div className="parties-row">
              {BillTo}
              {MetaTable}
            </div>
          </>
        )}

        {/* Place of supply */}
        {(invoice.customer_gstin || stateDisplay) && (
          <div className="supply-line">
            {invoice.customer_gstin && <span>Ship To GSTIN: {invoice.customer_gstin}&nbsp;&nbsp;</span>}
            {stateDisplay && <span>Place Of Supply: {stateDisplay}</span>}
          </div>
        )}

        {/* ── Line items ── */}
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
                  <div>{fmtDate(line.shipment_date)}</div>
                  {line.client_name && <div style={{ fontWeight: 600 }}>Consignee: {line.client_name}</div>}
                  <div className="awb-cell">AWB: {line.awb}</div>
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

        {/* ── Totals ── */}
        <div className={`totals-section tpl-${template}`}>
          <table className="totals-table">
            <tbody>
              <tr><td>Sub Total</td><td>{fmtInr(invoice.subtotal)}</td></tr>
              <tr>
                <td>CGST{uniformCgst ? ` (${lines[0].cgst_rate}%)` : ''}</td>
                <td>{fmtInr(invoice.cgst_amount)}</td>
              </tr>
              <tr>
                <td>SGST{uniformSgst ? ` (${lines[0].sgst_rate}%)` : ''}</td>
                <td>{fmtInr(invoice.sgst_amount)}</td>
              </tr>
              <tr className="total-row"><td>Total</td><td>₹{fmtInr(invoice.total)}</td></tr>
              <tr className="balance-row"><td>Balance Due</td><td>₹{fmtInr(balanceDue)}</td></tr>
            </tbody>
          </table>
        </div>

        {/* ── Amount in words ── */}
        <div className="words-row">
          Total In Words: <span>{amountToWords(invoice.total, invoice.currency ?? 'INR')}</span>
        </div>

        {/* ── Bank details + Terms ── */}
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

        {/* ── Signature ── */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
          <div style={{ textAlign: 'right' }}>
            {signatureUrl
              ? <img src={signatureUrl} alt="Authorised Signature" style={{ height: '3cm', width: 'auto', display: 'block', marginLeft: 'auto' }} />
              : <div style={{ height: '3cm', width: '5cm', borderBottom: '1px solid #999', marginLeft: 'auto' }} />}
            <div style={{ fontSize: '10.5px', marginTop: '4px' }}>Authorised Signature</div>
          </div>
        </div>

      </div>
    </>
  )
}
