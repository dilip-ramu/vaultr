import React from 'react'
import { Document, Page, View, Text } from '@react-pdf/renderer'
import { styles } from './pdf-styles'
import type { SupplierInvoice, SupplierInvoiceLine } from '@/lib/logistics/types'
import type { Customer } from '@/lib/types'

function fmt(amount: number, currency = 'INR'): string {
  const sym = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : `${currency} `
  const [int, dec] = amount.toFixed(2).split('.')
  const intFormatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sym}${intFormatted}.${dec}`
}

function amountInWords(amount: number): string {
  const ones = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
  ]
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function twoDigit(n: number): string {
    if (n === 0) return ''
    if (n < 20) return ones[n]
    return tens[Math.floor(n / 10)] + (n % 10 > 0 ? ' ' + ones[n % 10] : '')
  }

  function threeDigit(n: number): string {
    if (n === 0) return ''
    const h = Math.floor(n / 100)
    const r = n % 100
    const hundredPart = h > 0 ? ones[h] + ' Hundred' : ''
    const restPart = r > 0 ? twoDigit(r) : ''
    return hundredPart + (hundredPart && restPart ? ' ' : '') + restPart
  }

  const whole = Math.floor(amount)
  const paise = Math.round((amount - whole) * 100)

  if (whole === 0 && paise === 0) return 'Zero Rupees Only'

  const crore    = Math.floor(whole / 10_000_000)
  const lakh     = Math.floor((whole % 10_000_000) / 100_000)
  const thousand = Math.floor((whole % 100_000) / 1_000)
  const rest     = whole % 1_000

  const parts: string[] = []
  if (crore    > 0) parts.push(threeDigit(crore)    + ' Crore')
  if (lakh     > 0) parts.push(threeDigit(lakh)     + ' Lakh')
  if (thousand > 0) parts.push(threeDigit(thousand) + ' Thousand')
  if (rest     > 0) parts.push(threeDigit(rest))

  const rupeeWords = parts.join(' ') || 'Zero'
  const paiseWords = paise > 0 ? ' and ' + twoDigit(paise) + ' Paise' : ''
  return rupeeWords + ' Rupees' + paiseWords + ' Only'
}

interface Props {
  invoice: SupplierInvoice & { customer: Customer; lines: SupplierInvoiceLine[] }
  companyName?: string
  companyAddress?: string
}

export default function SupplierInvoicePDF({
  invoice,
  companyName = 'Your Company',
  companyAddress = '',
}: Props) {
  const { customer, lines } = invoice
  const generatedDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

  const hasGST = invoice.is_igst || invoice.cgst_amount > 0 || invoice.sgst_amount > 0

  return (
    <Document
      title={invoice.invoice_number}
      author={companyName}
      subject="Tax Invoice"
    >
      <Page size="A4" style={styles.page}>

        {/* ── Header ──────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.logoText}>VAULTR</Text>
            {companyName !== 'Your Company' && (
              <Text style={styles.companyName}>{companyName}</Text>
            )}
            {companyAddress ? (
              <Text style={styles.companyAddress}>{companyAddress}</Text>
            ) : null}
            {invoice.gstin_supplier ? (
              <Text style={[styles.companyAddress, { marginTop: 4 }]}>
                GSTIN: {invoice.gstin_supplier}
              </Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.invoiceTitle}>TAX INVOICE</Text>
            <View style={styles.invoiceMetaRow}>
              <Text style={styles.invoiceMetaLabel}>Invoice No:  </Text>
              <Text style={styles.invoiceMetaValue}>{invoice.invoice_number}</Text>
            </View>
            <View style={styles.invoiceMetaRow}>
              <Text style={styles.invoiceMetaLabel}>Date:  </Text>
              <Text style={styles.invoiceMetaValue}>{invoice.invoice_date}</Text>
            </View>
            {invoice.due_date ? (
              <View style={styles.invoiceMetaRow}>
                <Text style={styles.invoiceMetaLabel}>Due:  </Text>
                <Text style={styles.invoiceMetaValue}>{invoice.due_date}</Text>
              </View>
            ) : null}
            {invoice.place_of_supply ? (
              <View style={styles.invoiceMetaRow}>
                <Text style={styles.invoiceMetaLabel}>Place of Supply:  </Text>
                <Text style={styles.invoiceMetaValue}>{invoice.place_of_supply}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* ── Bill To ─────────────────────────────────────────── */}
        <View style={styles.billTo}>
          <Text style={styles.billToLabel}>Bill To</Text>
          <Text style={styles.billToName}>{customer.name}</Text>
          {customer.address ? (
            <Text style={styles.billToDetail}>{customer.address}</Text>
          ) : null}
          {(invoice.gstin_customer ?? customer.gst_number) ? (
            <Text style={styles.billToDetail}>
              GSTIN: {invoice.gstin_customer ?? customer.gst_number}
            </Text>
          ) : null}
          {customer.email ? (
            <Text style={styles.billToDetail}>{customer.email}</Text>
          ) : null}
        </View>

        {/* ── Line Items ──────────────────────────────────────── */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colNum]}>#</Text>
            <Text style={[styles.tableHeaderCell, styles.colAWB]}>AWB</Text>
            <Text style={[styles.tableHeaderCell, styles.colDesc]}>Description</Text>
            <Text style={[styles.tableHeaderCell, styles.colPCS]}>PCS</Text>
            <Text style={[styles.tableHeaderCell, styles.colDest]}>Destination</Text>
            <Text style={[styles.tableHeaderCell, styles.colAmount]}>Amount</Text>
          </View>
          {lines.map((line, i) => (
            <View key={line.id} style={i % 2 === 0 ? styles.tableRowOdd : styles.tableRowEven}>
              <Text style={[styles.tableCellMuted, styles.colNum]}>{i + 1}</Text>
              <Text style={[styles.tableCell, styles.colAWB]}>{line.awb_number ?? '—'}</Text>
              <Text style={[styles.tableCell, styles.colDesc]}>{line.description}</Text>
              <Text style={[styles.tableCellMuted, styles.colPCS]}>{line.pieces ?? '—'}</Text>
              <Text style={[styles.tableCellMuted, styles.colDest]}>{line.destination ?? '—'}</Text>
              <Text style={[styles.tableCell, styles.colAmount]}>
                {fmt(line.line_total, invoice.currency)}
              </Text>
            </View>
          ))}
        </View>

        {/* ── Totals ──────────────────────────────────────────── */}
        <View style={styles.totalsWrapper}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{fmt(invoice.subtotal, invoice.currency)}</Text>
          </View>

          {/* GST breakdown or simple tax */}
          {hasGST ? (
            invoice.is_igst ? (
              invoice.igst_amount > 0
                ? <View style={styles.totalsRow}>
                    <Text style={styles.totalsLabel}>IGST ({invoice.igst_rate}%)</Text>
                    <Text style={styles.totalsValue}>{fmt(invoice.igst_amount, invoice.currency)}</Text>
                  </View>
                : null
            ) : (
              <View>
                {invoice.cgst_amount > 0
                  ? <View style={styles.totalsRow}>
                      <Text style={styles.totalsLabel}>CGST ({invoice.cgst_rate}%)</Text>
                      <Text style={styles.totalsValue}>{fmt(invoice.cgst_amount, invoice.currency)}</Text>
                    </View>
                  : null}
                {invoice.sgst_amount > 0
                  ? <View style={styles.totalsRow}>
                      <Text style={styles.totalsLabel}>SGST ({invoice.sgst_rate}%)</Text>
                      <Text style={styles.totalsValue}>{fmt(invoice.sgst_amount, invoice.currency)}</Text>
                    </View>
                  : null}
              </View>
            )
          ) : invoice.tax_amount > 0 ? (
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>
                {invoice.tax_rate ? `GST (${invoice.tax_rate}%)` : 'Tax'}
              </Text>
              <Text style={styles.totalsValue}>{fmt(invoice.tax_amount, invoice.currency)}</Text>
            </View>
          ) : null}

          <View style={styles.totalsDivider} />
          <View style={styles.totalsFinalRow}>
            <Text style={styles.totalsFinalLabel}>Total</Text>
            <Text style={styles.totalsFinalValue}>{fmt(invoice.total_amount, invoice.currency)}</Text>
          </View>

          {/* Amount in words */}
          <View style={{ width: 320, marginTop: 6 }}>
            <Text style={{ fontSize: 7, color: '#6B7280', textAlign: 'right', fontStyle: 'italic' }}>
              {amountInWords(invoice.total_amount)}
            </Text>
          </View>
        </View>

        {/* ── Reverse Charge Notice ───────────────────────────── */}
        {invoice.reverse_charge ? (
          <View style={{ marginBottom: 12, paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#FEF9C3', borderRadius: 3 }}>
            <Text style={{ fontSize: 8, color: '#78350F' }}>
              Reverse Charge: Tax is payable on reverse charge basis.
            </Text>
          </View>
        ) : null}

        {/* ── HSN/SAC & Notes / Payment Terms ─────────────────── */}
        {(invoice.hsn_sac_code || invoice.payment_terms || invoice.notes) ? (
          <View style={styles.notesSection}>
            {invoice.hsn_sac_code ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.notesLabel}>HSN / SAC Code</Text>
                <Text style={[styles.notesText, { fontFamily: 'Courier' }]}>{invoice.hsn_sac_code}</Text>
              </View>
            ) : null}
            {invoice.payment_terms ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.notesLabel}>Payment Terms</Text>
                <Text style={styles.notesText}>{invoice.payment_terms}</Text>
              </View>
            ) : null}
            {invoice.notes ? (
              <View>
                <Text style={styles.notesLabel}>Notes</Text>
                <Text style={styles.notesText}>{invoice.notes}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* ── Authorized Signatory ────────────────────────────── */}
        <View style={{ marginTop: 40, flexDirection: 'row', justifyContent: 'flex-end' }}>
          <View style={{ alignItems: 'center', minWidth: 160 }}>
            <View style={{ borderTopWidth: 1, borderTopColor: '#D1D5DB', width: '100%', paddingTop: 6 }}>
              <Text style={{ fontSize: 8, color: '#6B7280', textAlign: 'center' }}>
                {companyName !== 'Your Company' ? companyName : 'Authorized Signatory'}
              </Text>
              <Text style={{ fontSize: 7, color: '#9CA3AF', textAlign: 'center', marginTop: 2 }}>
                Authorized Signatory
              </Text>
            </View>
          </View>
        </View>

        {/* ── Footer (fixed on every page) ────────────────────── */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Generated by Vaultr  •  {generatedDate}</Text>
          <Text style={styles.footerText}>{invoice.invoice_number}</Text>
        </View>

      </Page>
    </Document>
  )
}
