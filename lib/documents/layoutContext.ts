import type { DocModel, DocColumn } from './model'

export interface LayoutRow { cells: Record<string, string>; danger?: boolean; strong?: boolean }

/** Everything the LayoutRenderer needs to fill a template with real data. */
export interface LayoutContext {
  accent: string
  fields: Record<string, string>
  columns: DocColumn[]
  rows: LayoutRow[]
  totals: { label: string; value: string }[]
  grandLabel: string
  grandValue: string
  inWords?: string
  bankLines: string[]
  terms?: string
  logoUrl?: string | null
  signatureUrl?: string | null
  /** Fixed print size for the signature: pick width OR height (mm); the other
   *  dimension follows the image's aspect ratio. */
  signatureSize?: { mode: 'width' | 'height'; mm: number } | null
}

export function modelToContext(model: DocModel): LayoutContext {
  return {
    accent: model.accent,
    fields: model.fields ?? {},
    columns: model.columns,
    rows: model.rows,
    totals: model.totals ?? [],
    grandLabel: model.grandLabel ?? 'TOTAL',
    grandValue: model.grandValue ?? '',
    inWords: model.inWords,
    bankLines: model.bankLines ?? [],
    terms: model.terms,
    logoUrl: model.logoUrl ?? null,
    signatureUrl: model.signatureUrl ?? null,
    signatureSize: model.signatureSize ?? null,
  }
}

/** Placeholder data so the designer preview looks real. */
export function sampleContext(format: string, accent: string): LayoutContext {
  const gstCols: DocColumn[] = [
    { key: 'desc', label: 'DESCRIPTION', flex: 2.6 },
    { key: 'hsn', label: 'HSN', align: 'center', flex: 0.7 },
    { key: 'qty', label: 'QTY', align: 'center', flex: 0.6 },
    { key: 'rate', label: 'RATE', align: 'right', flex: 0.9 },
    { key: 'amt', label: 'AMOUNT', align: 'right', flex: 0.9 },
  ]
  const title = ({
    tax_invoice: 'TAX INVOICE', quotation: 'QUOTATION', proforma_gst: 'PROFORMA INVOICE',
    sales_order: 'SALES ORDER', delivery_challan: 'DELIVERY CHALLAN', credit_note: 'CREDIT NOTE',
    purchase_order: 'PURCHASE ORDER', debit_note: 'DEBIT NOTE', salary_slip: 'SALARY SLIP', reimbursable: 'INVOICE',
  } as Record<string, string>)[format] ?? 'DOCUMENT'

  if (format === 'salary_slip') {
    return {
      accent,
      fields: {
        'doc.title': 'SALARY SLIP',
        'company.name': 'Your Company Pvt Ltd', 'company.address': '2/1010F, Road, City 641605',
        'employee.name': 'Asha Rao', 'employee.id': 'EMP-014', 'employee.designation': 'Designer',
        'employee.pan': 'ABCDE1234F', 'employee.joining': '01 Apr 2024',
        'employee.bank': 'HDFC Bank', 'employee.account': '50100XXXXXX', 'employee.ifsc': 'HDFC0000123',
        'slip.month': 'July 2026', 'slip.paidOn': '05 Aug 2026',
        'slip.gross': '₹90,000', 'slip.deductions': '₹6,500',
        'slip.net': '₹83,500', 'slip.words': 'Eighty-three thousand five hundred rupees only',
        'slip.sourceSalary': '1,000.00 EUR', 'slip.fxRate': '₹80.00',
      },
      columns: [{ key: 'c', label: 'COMPONENT', flex: 2 }, { key: 'a', label: 'AMOUNT', align: 'right', flex: 1 }],
      rows: [
        { cells: { c: 'Basic', a: '₹80,000' } },
        { cells: { c: 'Allowances', a: '₹5,000' } },
        { cells: { c: 'Overtime', a: '₹2,000' } },
        { cells: { c: 'Incentives', a: '₹3,000' } },
        { strong: true, cells: { c: 'Gross earnings', a: '₹90,000' } },
        { danger: true, cells: { c: 'Deductions', a: '₹1,500' } },
        { danger: true, cells: { c: 'Advance', a: '₹5,000' } },
        { strong: true, cells: { c: 'Total deductions', a: '₹6,500' } },
      ],
      totals: [], grandLabel: 'NET PAY', grandValue: '₹83,500',
      bankLines: [], logoUrl: null, signatureUrl: null,
    }
  }

  return {
    accent,
    fields: {
      'doc.title': title, 'doc.number': 'C-XX260001', 'doc.date': '11 Jul 2026', 'doc.reference': 'REF-001',
      'company.name': 'Your Company Pvt Ltd', 'company.address': '2/1010F, Road, City 641605',
      'company.gstin': '33ABCDE1234F1Z5', 'company.phone': '+91 90000 00000', 'company.email': 'hello@company.com',
      'party.label': 'BILL TO', 'party.name': 'Acme Corp', 'party.address': 'Mumbai 400050', 'party.gstin': '27AABCA5678K1Z2',
      'totals.grandLabel': 'TOTAL', 'totals.grand': '₹2,59,600', 'totals.inWords': 'Two lakh fifty-nine thousand six hundred only',
      'employee.name': 'Asha Rao', 'employee.id': 'EMP-014', 'employee.designation': 'Designer',
      'slip.month': 'July 2026', 'slip.net': '₹83,500', 'slip.words': 'Eighty-three thousand five hundred only',
    },
    columns: gstCols,
    rows: [
      { cells: { desc: 'Design retainer — July', hsn: '9983', qty: '1', rate: '1,80,000', amt: '1,80,000' } },
      { cells: { desc: 'Brand assets pack', hsn: '9983', qty: '1', rate: '40,000', amt: '40,000' } },
    ],
    totals: [
      { label: 'Taxable value', value: '₹2,20,000' },
      { label: 'CGST 9%', value: '₹19,800' },
      { label: 'SGST 9%', value: '₹19,800' },
    ],
    grandLabel: 'TOTAL', grandValue: '₹2,59,600',
    inWords: 'Two lakh fifty-nine thousand six hundred rupees only',
    bankLines: ['Bank: HDFC Bank', 'Account Number: 501000012345', 'IFSC: HDFC0001234'],
    terms: 'Payment due within 30 days. Subject to local jurisdiction.',
    logoUrl: null, signatureUrl: null,
  }
}
