import {
  Document, Page, Text, View, StyleSheet, Font, Image,
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
  item_type: 'salary' | 'courier' | 'expense'
  description: string
  salary_euro?: number | null
  expended_rate?: number | null
  amount_inr: number
  sort_order: number
}

export interface ContrastInvoiceData {
  invoice_number: string
  invoice_month: string   // "YYYY-MM"
  invoice_date: string
  items: InvoiceItem[]
  subtotal: number
  gst_amount: number
  total: number
  company_name?: string
}

const MONTHS_LONG = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']

function monthLabel(ym: string) {
  const [y, m] = ym.split('-')
  return `${MONTHS_LONG[parseInt(m) - 1]} ${y}`
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

function fmtEuro(n: number): string {
  return `EUR ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const s = StyleSheet.create({
  page:       { padding: 40, fontSize: 9, fontFamily: 'LiberationSans', color: '#1a1a1a', backgroundColor: '#ffffff' },
  // Header
  topRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  logoBox:    { width: 80, height: 40 },
  titleBlock: { alignItems: 'flex-end' },
  proforma:   { fontSize: 18, fontWeight: 'bold', color: '#1a1a1a' },
  invNum:     { fontSize: 9, color: '#666', marginTop: 2 },
  // From / To
  addressRow: { flexDirection: 'row', gap: 20, marginBottom: 14 },
  addressBox: { flex: 1, padding: 10, backgroundColor: '#f8f8f8', borderRadius: 4 },
  addrLabel:  { fontSize: 7, color: '#999', fontWeight: 'bold', marginBottom: 3, textTransform: 'uppercase' },
  addrName:   { fontSize: 10, fontWeight: 'bold', marginBottom: 2 },
  addrLine:   { fontSize: 8, color: '#555', lineHeight: 1.4 },
  // Meta row
  metaRow:    { flexDirection: 'row', gap: 8, marginBottom: 14 },
  metaBox:    { flex: 1, padding: 8, borderWidth: 0.5, borderColor: '#ddd', borderRadius: 4 },
  metaLabel:  { fontSize: 7, color: '#999', fontWeight: 'bold', marginBottom: 2 },
  metaVal:    { fontSize: 9, fontWeight: 'bold' },
  // Table
  table:      { borderWidth: 0.5, borderColor: '#ccc', marginBottom: 10 },
  thead:      { flexDirection: 'row', backgroundColor: '#1a1a2e', borderBottomWidth: 0.5, borderBottomColor: '#ccc' },
  th:         { padding: 6, fontWeight: 'bold', fontSize: 8, color: '#ffffff' },
  trow:       { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  trowAlt:    { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#eee', backgroundColor: '#fafafa' },
  td:         { padding: 5, fontSize: 8 },
  tdRight:    { padding: 5, fontSize: 8, textAlign: 'right' },
  tdCenter:   { padding: 5, fontSize: 8, textAlign: 'center' },
  // Section dividers in table
  sectionRow: { flexDirection: 'row', backgroundColor: '#f0f4ff', borderBottomWidth: 0.5, borderBottomColor: '#ccc' },
  sectionCell:{ padding: 4, fontSize: 7, fontWeight: 'bold', color: '#3b4ac7', flex: 1 },
  // Totals
  totalSection: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 14 },
  totalBox:     { width: 220 },
  totalRow:     { flexDirection: 'row', justifyContent: 'space-between', padding: 5, borderBottomWidth: 0.5, borderBottomColor: '#eee' },
  totalLabel:   { fontSize: 9, color: '#555' },
  totalVal:     { fontSize: 9, fontWeight: 'bold' },
  grandRow:     { flexDirection: 'row', justifyContent: 'space-between', padding: 7, backgroundColor: '#1a1a2e' },
  grandLabel:   { fontSize: 10, fontWeight: 'bold', color: '#fff' },
  grandVal:     { fontSize: 10, fontWeight: 'bold', color: '#fff' },
  // Bank
  bankSection:  { borderTopWidth: 0.5, borderTopColor: '#ddd', paddingTop: 10, marginBottom: 10 },
  bankTitle:    { fontSize: 8, fontWeight: 'bold', marginBottom: 5, color: '#333' },
  bankGrid:     { flexDirection: 'row', gap: 16 },
  bankCol:      { flex: 1 },
  bankRow:      { flexDirection: 'row', marginBottom: 3 },
  bankKey:      { fontSize: 7, color: '#999', width: 90 },
  bankVal:      { fontSize: 7, fontWeight: 'bold', color: '#1a1a1a', flex: 1 },
  // Footer
  footer:     { marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: '#ddd', paddingTop: 8 },
  signBox:    { width: 140, borderTopWidth: 1, borderTopColor: '#1a1a1a', paddingTop: 4 },
  signLabel:  { fontSize: 7, color: '#777' },
  footNote:   { fontSize: 7, color: '#aaa', fontStyle: 'italic', alignSelf: 'flex-end' },
})

export default function ContrastInvoicePDF({ data }: { data: ContrastInvoiceData }) {
  const salaryItems  = data.items.filter(i => i.item_type === 'salary')
  const courierItems = data.items.filter(i => i.item_type === 'courier')
  const expenseItems = data.items.filter(i => i.item_type === 'expense')

  const renderRow = (item: InvoiceItem, idx: number) => {
    const isSalary = item.item_type === 'salary'
    const RowStyle = idx % 2 === 0 ? s.trow : s.trowAlt
    return (
      <View key={idx} style={RowStyle}>
        <Text style={[s.td, { flex: 3 }]}>{item.description}</Text>
        {isSalary ? (
          <>
            <Text style={[s.tdRight, { flex: 1.5 }]}>
              {item.salary_euro ? fmtEuro(item.salary_euro) : ''}
            </Text>
            <Text style={[s.tdRight, { flex: 1.5 }]}>
              {item.expended_rate ? `@ ${item.expended_rate.toFixed(2)}` : ''}
            </Text>
            <Text style={[s.tdRight, { flex: 1.5 }]}>{fmtInr(item.amount_inr)}</Text>
          </>
        ) : (
          <>
            <Text style={[s.tdRight, { flex: 1.5 }]}>—</Text>
            <Text style={[s.tdRight, { flex: 1.5 }]}>—</Text>
            <Text style={[s.tdRight, { flex: 1.5 }]}>{fmtInr(item.amount_inr)}</Text>
          </>
        )}
      </View>
    )
  }

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Header ── */}
        <View style={s.topRow}>
          <View>
            <Text style={{ fontSize: 14, fontWeight: 'bold' }}>
              {data.company_name ?? 'YOUR COMPANY'}
            </Text>
            <Text style={{ fontSize: 8, color: '#666', marginTop: 2 }}>Tiruppur, Tamil Nadu, India</Text>
            <Text style={{ fontSize: 8, color: '#666' }}>+91 99433 11021</Text>
          </View>
          <View style={s.titleBlock}>
            <Text style={s.proforma}>PROFORMA INVOICE</Text>
            <Text style={s.invNum}>{data.invoice_number}</Text>
          </View>
        </View>

        {/* ── From / To ── */}
        <View style={s.addressRow}>
          <View style={s.addressBox}>
            <Text style={s.addrLabel}>Bill To</Text>
            <Text style={s.addrName}>Contrast Company A/S</Text>
            <Text style={s.addrLine}>Rudolfsgaardvej 6A</Text>
            <Text style={s.addrLine}>Denmark</Text>
            <Text style={s.addrLine}>Contact: Jan Andersen</Text>
          </View>
          <View style={s.addressBox}>
            <Text style={s.addrLabel}>Payment Terms</Text>
            <Text style={[s.addrName, { marginBottom: 4 }]}>Telegraphic Transfer (TT)</Text>
            <Text style={s.addrLabel}>For the Month of</Text>
            <Text style={[s.addrName]}>{monthLabel(data.invoice_month)}</Text>
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
            <Text style={s.metaVal}>INR (Indian Rupees)</Text>
          </View>
          <View style={s.metaBox}>
            <Text style={s.metaLabel}>GST Rate</Text>
            <Text style={s.metaVal}>18%</Text>
          </View>
        </View>

        {/* ── Line Items Table ── */}
        <View style={s.table}>
          {/* Table header */}
          <View style={s.thead}>
            <Text style={[s.th, { flex: 3 }]}>Description</Text>
            <Text style={[s.th, { flex: 1.5, textAlign: 'right' }]}>Euro</Text>
            <Text style={[s.th, { flex: 1.5, textAlign: 'right' }]}>Rate</Text>
            <Text style={[s.th, { flex: 1.5, textAlign: 'right' }]}>Amount (Rs.)</Text>
          </View>

          {/* Salary section */}
          {salaryItems.length > 0 && (
            <>
              <View style={s.sectionRow}>
                <Text style={s.sectionCell}>SALARIES</Text>
              </View>
              {salaryItems.map(renderRow)}
            </>
          )}

          {/* Courier section */}
          {courierItems.length > 0 && (
            <>
              <View style={s.sectionRow}>
                <Text style={s.sectionCell}>COURIER CHARGES</Text>
              </View>
              {courierItems.map(renderRow)}
            </>
          )}

          {/* Expenses section */}
          {expenseItems.length > 0 && (
            <>
              <View style={s.sectionRow}>
                <Text style={s.sectionCell}>OPERATIONAL EXPENSES</Text>
              </View>
              {expenseItems.map(renderRow)}
            </>
          )}
        </View>

        {/* ── Totals ── */}
        <View style={s.totalSection}>
          <View style={s.totalBox}>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Sub Total</Text>
              <Text style={s.totalVal}>{fmtInr(data.subtotal)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>GST @ 18%</Text>
              <Text style={s.totalVal}>{fmtInr(data.gst_amount)}</Text>
            </View>
            <View style={s.grandRow}>
              <Text style={s.grandLabel}>GRAND TOTAL</Text>
              <Text style={s.grandVal}>{fmtInr(data.total)}</Text>
            </View>
          </View>
        </View>

        {/* ── Bank Details ── */}
        <View style={s.bankSection}>
          <Text style={s.bankTitle}>Bank Details for Payment</Text>
          <View style={s.bankGrid}>
            <View style={s.bankCol}>
              <View style={s.bankRow}>
                <Text style={s.bankKey}>Beneficiary Name</Text>
                <Text style={s.bankVal}>{data.company_name ?? 'YOUR COMPANY'}</Text>
              </View>
              <View style={s.bankRow}>
                <Text style={s.bankKey}>Account Number</Text>
                <Text style={s.bankVal}>0009502000100563</Text>
              </View>
              <View style={s.bankRow}>
                <Text style={s.bankKey}>Bank / Branch</Text>
                <Text style={s.bankVal}>INDIAN OVERSEAS BANK, TIRUPPUR BRANCH</Text>
              </View>
            </View>
            <View style={s.bankCol}>
              <View style={s.bankRow}>
                <Text style={s.bankKey}>IFSC Code</Text>
                <Text style={s.bankVal}>IOBA0000095</Text>
              </View>
              <View style={s.bankRow}>
                <Text style={s.bankKey}>SWIFT Code</Text>
                <Text style={s.bankVal}>IOBAINBB095</Text>
              </View>
              <View style={s.bankRow}>
                <Text style={s.bankKey}>Payment Terms</Text>
                <Text style={s.bankVal}>TT (Telegraphic Transfer)</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Footer / Signature ── */}
        <View style={s.footer}>
          <View style={s.signBox}>
            <Text style={s.signLabel}>Authorised Signature &amp; Date</Text>
          </View>
          <Text style={s.footNote}>
            This is a computer-generated proforma invoice.
          </Text>
        </View>

      </Page>
    </Document>
  )
}
