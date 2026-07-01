import {
  Document, Page, Text, View, StyleSheet, Font,
} from '@react-pdf/renderer'

const origin = typeof window !== 'undefined' ? window.location.origin : ''
Font.register({
  family: 'LiberationSans',
  fonts: [
    { src: `${origin}/fonts/LiberationSans-Regular.ttf`, fontWeight: 'normal' },
    { src: `${origin}/fonts/LiberationSans-Bold.ttf`,    fontWeight: 'bold' },
    { src: `${origin}/fonts/LiberationSans-Italic.ttf`,  fontWeight: 'normal', fontStyle: 'italic' },
  ],
})

export interface InvoiceItem {
  item_type: 'salary' | 'courier' | 'expense' | 'fixed_expense' | 'deduction'
  description: string
  salary_amount?: number | null   // salary lines: EUR amount
  expended_rate?: number | null // kept for DB compat, unused in display
  amount_inr: number            // billing amount in EUR (field name legacy)
  inr_source?: number | null    // original INR amount (courier/expense, display only)
  forex_rate?: number | null    // rate used (courier/expense, display only)
  sort_order: number
}

export interface ReimbursableInvoiceData {
  invoice_number: string
  invoice_month: string   // "YYYY-MM"
  invoice_date: string
  items: InvoiceItem[]
  subtotal: number
  gst_amount: number
  total: number
  /** Currency the invoice is billed in — replaces the old EUR hardcode.
   *  Defaults to 'EUR' when not provided so old callers still work. */
  currency?: string
  /** Optional Bill From block. When missing we fall back to a generic
   *  "Your Company" placeholder so nothing crashes for old callers. */
  bill_from?: {
    name: string
    contact?: string
    email?: string
    phone?: string
    address?: string
    bank_account_name?: string
    bank_account_number?: string
    bank_ifsc?: string
    bank_name?: string
    swift_code?: string
  }
  /** Optional Bill To block. Same rules as bill_from. */
  bill_to?: {
    name: string
    contact?: string
    email?: string
    address?: string
    country?: string
  }
  /** Legacy — was used for the top-left brand title. Now optional; the PDF
   *  falls back to bill_from.name if this isn't set. */
  company_name?: string
  forex_rate?: number     // INR per <currency> used for this invoice
}

const MONTHS_LONG = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return `${MONTHS_LONG[parseInt(m) - 1]} ${y}`
}

/** Currency-aware number formatter. Was hardcoded to EUR; now takes the
 *  currency code from the invoice data so the PDF matches the customer's
 *  billing currency. Falls back gracefully if Intl doesn't know the code. */
function fmtCur(n: number, cur: string): string {
  const abs = Math.abs(n)
  const str = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return n < 0 ? `(${cur} ${str})` : `${cur} ${str}`
}

function fmtInr(n: number): string {
  const [intPart, dec] = Math.abs(n).toFixed(2).split('.')
  const int = parseInt(intPart, 10)
  let s = ''
  if (int === 0) { s = '0' }
  else {
    const last3 = int % 1000
    const rest = Math.floor(int / 1000)
    s = String(last3)
    let r = rest
    while (r > 0) { s = String(r % 100).padStart(r > 100 ? 2 : 1, '0') + ',' + s; r = Math.floor(r / 100) }
  }
  return `Rs. ${s}.${dec}`
}

const s = StyleSheet.create({
  page:       { padding: 40, fontSize: 9, fontFamily: 'LiberationSans', color: '#1a1a1a', backgroundColor: '#ffffff' },
  topRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  titleBlock: { alignItems: 'flex-end' },
  proforma:   { fontSize: 18, fontWeight: 'bold', color: '#1a1a1a' },
  invNum:     { fontSize: 9, color: '#666', marginTop: 2 },
  addressRow: { flexDirection: 'row', gap: 20, marginBottom: 14 },
  addressBox: { flex: 1, padding: 10, backgroundColor: '#f8f8f8', borderRadius: 4 },
  addrLabel:  { fontSize: 7, color: '#999', fontWeight: 'bold', marginBottom: 3, textTransform: 'uppercase' },
  addrName:   { fontSize: 10, fontWeight: 'bold', marginBottom: 2 },
  addrLine:   { fontSize: 8, color: '#555', lineHeight: 1.4 },
  metaRow:    { flexDirection: 'row', gap: 8, marginBottom: 14 },
  metaBox:    { flex: 1, padding: 8, borderWidth: 0.5, borderColor: '#ddd', borderRadius: 4 },
  metaLabel:  { fontSize: 7, color: '#999', fontWeight: 'bold', marginBottom: 2 },
  metaVal:    { fontSize: 9, fontWeight: 'bold' },
  table:      { borderWidth: 0.5, borderColor: '#ccc', marginBottom: 10 },
  thead:      { flexDirection: 'row', backgroundColor: '#1a1a2e', borderBottomWidth: 0.5, borderBottomColor: '#ccc' },
  th:         { padding: 6, fontWeight: 'bold', fontSize: 8, color: '#ffffff' },
  trow:       { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  trowAlt:    { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#eee', backgroundColor: '#fafafa' },
  td:         { padding: 5, fontSize: 8 },
  tdRight:    { padding: 5, fontSize: 8, textAlign: 'right' },
  sectionRow: { flexDirection: 'row', backgroundColor: '#f0f4ff', borderBottomWidth: 0.5, borderBottomColor: '#ccc' },
  sectionCell:{ padding: 4, fontSize: 7, fontWeight: 'bold', color: '#3b4ac7', flex: 1 },
  totalSection: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 14 },
  totalBox:     { width: 220 },
  totalRow:     { flexDirection: 'row', justifyContent: 'space-between', padding: 5, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  totalLabel:   { fontSize: 9, color: '#555' },
  totalVal:     { fontSize: 9, fontWeight: 'bold' },
  grandRow:     { flexDirection: 'row', justifyContent: 'space-between', padding: 7, backgroundColor: '#1a1a2e' },
  grandLabel:   { fontSize: 10, fontWeight: 'bold', color: '#fff' },
  grandVal:     { fontSize: 10, fontWeight: 'bold', color: '#fff' },
  bankSection:  { borderTopWidth: 0.5, borderTopColor: '#ddd', paddingTop: 10, marginBottom: 10 },
  bankTitle:    { fontSize: 8, fontWeight: 'bold', marginBottom: 5, color: '#333' },
  bankGrid:     { flexDirection: 'row', gap: 16 },
  bankCol:      { flex: 1 },
  bankRow:      { flexDirection: 'row', marginBottom: 3 },
  bankKey:      { fontSize: 7, color: '#999', width: 90 },
  bankVal:      { fontSize: 7, fontWeight: 'bold', color: '#1a1a1a', flex: 1 },
  footer:     { marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: '#ddd', paddingTop: 8 },
  signBox:    { width: 140, borderTopWidth: 1, borderTopColor: '#1a1a1a', paddingTop: 4 },
  signLabel:  { fontSize: 7, color: '#777' },
  footNote:   { fontSize: 7, color: '#aaa', fontStyle: 'italic', alignSelf: 'flex-end' },
})

export default function ReimbursableInvoicePDF({ data }: { data: ReimbursableInvoiceData }) {
  const salaryItems       = data.items.filter(i => i.item_type === 'salary')
  const courierItems      = data.items.filter(i => i.item_type === 'courier')
  const expenseItems      = data.items.filter(i => i.item_type === 'expense')
  const fixedExpenseItems = data.items.filter(i => i.item_type === 'fixed_expense')
  const deductionItems    = data.items.filter(i => i.item_type === 'deduction')

  // Currency for every amount label. Falls back to EUR only for legacy
  // callers that don't set data.currency yet.
  const cur = data.currency ?? 'EUR'
  // Bill From / Bill To with safe fallbacks so an incomplete payload still
  // renders a legible invoice — better than a blank block.
  const from = data.bill_from ?? { name: data.company_name ?? 'Your Company' }
  const to   = data.bill_to   ?? { name: '—' }

  const renderRow = (item: InvoiceItem, idx: number) => {
    const RowStyle = idx % 2 === 0 ? s.trow : s.trowAlt
    const noInr = item.item_type === 'salary' || item.item_type === 'fixed_expense' || item.item_type === 'deduction'
    const isDeduction = item.item_type === 'deduction'
    return (
      <View key={idx} style={RowStyle}>
        <Text style={[s.td, { flex: 3 }, isDeduction ? { color: '#c0392b' } : {}]}>{item.description}</Text>
        <Text style={[s.tdRight, { flex: 1.5 }]}>
          {noInr ? '—' : (item.inr_source != null ? fmtInr(item.inr_source) : '—')}
        </Text>
        <Text style={[s.tdRight, { flex: 1.5 }, isDeduction ? { color: '#c0392b' } : {}]}>
          {fmtCur(item.amount_inr, cur)}
        </Text>
      </View>
    )
  }

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.topRow}>
          <View>
            <Text style={{ fontSize: 14, fontWeight: 'bold' }}>{from.name.toUpperCase()}</Text>
            {from.address && (
              <Text style={{ fontSize: 8, color: '#666', marginTop: 2 }}>{from.address}</Text>
            )}
          </View>
          <View style={s.titleBlock}>
            <Text style={s.proforma}>PROFORMA INVOICE</Text>
            <Text style={s.invNum}>{data.invoice_number}</Text>
          </View>
        </View>

        {/* ── From / To ── */}
        <View style={s.addressRow}>
          <View style={s.addressBox}>
            <Text style={s.addrLabel}>Bill From</Text>
            <Text style={s.addrName}>{from.name}</Text>
            {from.contact && <Text style={s.addrLine}>Contact: {from.contact}</Text>}
            {from.email   && <Text style={s.addrLine}>E-mail: {from.email}</Text>}
            {from.phone   && <Text style={s.addrLine}>Phone: {from.phone}</Text>}
          </View>
          <View style={s.addressBox}>
            <Text style={s.addrLabel}>Bill To</Text>
            <Text style={s.addrName}>{to.name}</Text>
            {to.address && <Text style={s.addrLine}>{to.address}</Text>}
            {to.country && <Text style={s.addrLine}>{to.country}</Text>}
            {to.contact && <Text style={s.addrLine}>Contact: {to.contact}</Text>}
          </View>
          <View style={s.addressBox}>
            <Text style={s.addrLabel}>Payment Terms</Text>
            <Text style={[s.addrName, { marginBottom: 4 }]}>Telegraphic Transfer (TT)</Text>
            <Text style={s.addrLabel}>For the Month of</Text>
            <Text style={s.addrName}>{monthLabel(data.invoice_month)}</Text>
          </View>
        </View>

        {/* ── Meta row ── */}
        <View style={s.metaRow}>
          <View style={s.metaBox}>
            <Text style={s.metaLabel}>Invoice Number</Text>
            <Text style={s.metaVal}>{data.invoice_number}</Text>
          </View>
          <View style={s.metaBox}>
            <Text style={s.metaLabel}>Invoice Date</Text>
            <Text style={s.metaVal}>{data.invoice_date}</Text>
          </View>
          <View style={s.metaBox}>
            <Text style={s.metaLabel}>Currency</Text>
            <Text style={s.metaVal}>{cur}</Text>
          </View>
          {data.forex_rate && (
            <View style={s.metaBox}>
              <Text style={s.metaLabel}>Forex Rate Used</Text>
              <Text style={s.metaVal}>1 {cur} = Rs. {data.forex_rate.toFixed(2)}</Text>
            </View>
          )}
        </View>

        {/* ── Line Items Table ── */}
        <View style={s.table}>
          <View style={s.thead}>
            <Text style={[s.th, { flex: 3 }]}>Description</Text>
            <Text style={[s.th, { flex: 1.5, textAlign: 'right' }]}>INR Amount</Text>
            <Text style={[s.th, { flex: 1.5, textAlign: 'right' }]}>Amount ({cur})</Text>
          </View>

          {salaryItems.length > 0 && (
            <>
              <View style={s.sectionRow}>
                <Text style={s.sectionCell}>SALARIES</Text>
              </View>
              {salaryItems.map(renderRow)}
            </>
          )}

          {courierItems.length > 0 && (
            <>
              <View style={s.sectionRow}>
                <Text style={s.sectionCell}>COURIER CHARGES</Text>
              </View>
              {courierItems.map(renderRow)}
            </>
          )}

          {expenseItems.length > 0 && (
            <>
              <View style={s.sectionRow}>
                <Text style={s.sectionCell}>OPERATIONAL EXPENSES</Text>
              </View>
              {expenseItems.map(renderRow)}
            </>
          )}

          {fixedExpenseItems.length > 0 && (
            <>
              <View style={s.sectionRow}>
                <Text style={s.sectionCell}>FIXED EXPENSES</Text>
              </View>
              {fixedExpenseItems.map(renderRow)}
            </>
          )}

          {deductionItems.length > 0 && (
            <>
              <View style={[s.sectionRow, { backgroundColor: '#fff0f0' }]}>
                <Text style={[s.sectionCell, { color: '#c0392b' }]}>DEDUCTIONS</Text>
              </View>
              {deductionItems.map(renderRow)}
            </>
          )}
        </View>

        {/* ── Totals ── */}
        <View style={s.totalSection}>
          <View style={s.totalBox}>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Sub Total</Text>
              <Text style={s.totalVal}>{fmtCur(data.subtotal, cur)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>GST @ 18%</Text>
              <Text style={s.totalVal}>{fmtCur(data.gst_amount, cur)}</Text>
            </View>
            <View style={s.grandRow}>
              <Text style={s.grandLabel}>GRAND TOTAL</Text>
              <Text style={s.grandVal}>{fmtCur(data.total, cur)}</Text>
            </View>
          </View>
        </View>

        {/* ── Bank Details ── driven by the bill-from company (companies
             table). Hidden entirely when the company has no bank rows set,
             rather than falling back to hardcoded Contrast IOB details. */}
        {(from.bank_account_number || from.bank_ifsc || from.swift_code || from.bank_account_name) && (
          <View style={s.bankSection}>
            <Text style={s.bankTitle}>Bank Details for Payment</Text>
            <View style={s.bankGrid}>
              <View style={s.bankCol}>
                {from.bank_account_name && (
                  <View style={s.bankRow}>
                    <Text style={s.bankKey}>Beneficiary Name</Text>
                    <Text style={s.bankVal}>{from.bank_account_name}</Text>
                  </View>
                )}
                {from.bank_account_number && (
                  <View style={s.bankRow}>
                    <Text style={s.bankKey}>Account Number</Text>
                    <Text style={s.bankVal}>{from.bank_account_number}</Text>
                  </View>
                )}
                {from.bank_name && (
                  <View style={s.bankRow}>
                    <Text style={s.bankKey}>Bank / Branch</Text>
                    <Text style={s.bankVal}>{from.bank_name}</Text>
                  </View>
                )}
              </View>
              <View style={s.bankCol}>
                {from.bank_ifsc && (
                  <View style={s.bankRow}>
                    <Text style={s.bankKey}>IFSC Code</Text>
                    <Text style={s.bankVal}>{from.bank_ifsc}</Text>
                  </View>
                )}
                {from.swift_code && (
                  <View style={s.bankRow}>
                    <Text style={s.bankKey}>SWIFT Code</Text>
                    <Text style={s.bankVal}>{from.swift_code}</Text>
                  </View>
                )}
                <View style={s.bankRow}>
                  <Text style={s.bankKey}>Payment Terms</Text>
                  <Text style={s.bankVal}>TT (Telegraphic Transfer)</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ── Signature ── */}
        <View style={s.footer}>
          <View style={s.signBox}>
            <Text style={s.signLabel}>Authorised Signature &amp; Date</Text>
          </View>
        </View>

      </Page>
    </Document>
  )
}
