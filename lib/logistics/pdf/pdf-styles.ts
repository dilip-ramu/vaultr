import { StyleSheet } from '@react-pdf/renderer'

export const styles = StyleSheet.create({
  // Page
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#111827',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 40,
    paddingVertical: 40,
  },

  // Header bar
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 28,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  logoText: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: '#6366F1',
    letterSpacing: 3,
  },
  companyName: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
    marginTop: 4,
  },
  companyAddress: {
    fontSize: 8,
    color: '#6B7280',
    marginTop: 2,
  },
  invoiceTitle: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
    textAlign: 'right',
  },
  invoiceMetaRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 3,
  },
  invoiceMetaLabel: {
    fontSize: 8,
    color: '#6B7280',
  },
  invoiceMetaValue: {
    fontSize: 8,
    color: '#111827',
    fontFamily: 'Helvetica-Bold',
  },

  // Bill To
  billTo: {
    marginBottom: 24,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  billToLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 5,
  },
  billToName: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
  },
  billToDetail: {
    fontSize: 8,
    color: '#6B7280',
    marginTop: 2,
  },

  // Table
  table: {
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#6366F1',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 3,
  },
  tableHeaderCell: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableRowOdd: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  tableRowEven: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  tableCell: {
    fontSize: 8,
    color: '#111827',
  },
  tableCellMuted: {
    fontSize: 8,
    color: '#6B7280',
  },

  // Column widths
  colNum:    { width: '5%' },
  colAWB:    { width: '17%' },
  colDesc:   { width: '31%' },
  colPCS:    { width: '8%', textAlign: 'center' },
  colDest:   { width: '19%' },
  colAmount: { width: '20%', textAlign: 'right' },

  // Totals
  totalsWrapper: {
    alignItems: 'flex-end',
    marginBottom: 20,
  },
  totalsRow: {
    flexDirection: 'row',
    width: 220,
    paddingVertical: 3,
  },
  totalsLabel: {
    fontSize: 9,
    color: '#6B7280',
    width: 130,
    textAlign: 'right',
    paddingRight: 12,
  },
  totalsValue: {
    fontSize: 9,
    color: '#111827',
    width: 90,
    textAlign: 'right',
  },
  totalsDivider: {
    width: 220,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginVertical: 3,
  },
  totalsFinalRow: {
    flexDirection: 'row',
    width: 220,
    paddingVertical: 4,
  },
  totalsFinalLabel: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
    width: 130,
    textAlign: 'right',
    paddingRight: 12,
  },
  totalsFinalValue: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#6366F1',
    width: 90,
    textAlign: 'right',
  },

  // Notes / payment terms
  notesSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  notesLabel: {
    fontSize: 7,
    fontFamily: 'Helvetica-Bold',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  notesText: {
    fontSize: 9,
    color: '#6B7280',
    lineHeight: 1.4,
  },

  // Footer (fixed, bottom of each page)
  footer: {
    position: 'absolute',
    bottom: 28,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: '#9CA3AF',
  },
})
