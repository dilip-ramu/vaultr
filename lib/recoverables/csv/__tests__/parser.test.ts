import { describe, it, expect } from 'vitest'
import { parseCSVText, detectColumns, getSupplierColumns } from '../parser'
import { validateRows } from '../validator'
import { transformToShipments } from '../transformer'

// ── detectColumns ────────────────────────────────────────────

describe('detectColumns', () => {
  it('identifies fixed columns and supplier columns', () => {
    const result = detectColumns(['AWB', 'Total Cost', 'Total PCS', 'Supplier A', 'Supplier B'])
    expect(result.referenceCol).toBe(0)
    expect(result.totalCostCol).toBe(1)
    expect(result.totalPcsCol).toBe(2)
    expect(result.supplierCols).toEqual([
      { name: 'Supplier A', index: 3 },
      { name: 'Supplier B', index: 4 },
    ])
    expect(result.errors).toHaveLength(0)
  })

  it('matches alternative header names case-insensitively', () => {
    const result = detectColumns(['Reference', 'Amount', 'Pieces', 'Factory X'])
    expect(result.referenceCol).toBe(0)
    expect(result.totalCostCol).toBe(1)
    expect(result.totalPcsCol).toBe(2)
    expect(result.supplierCols).toEqual([{ name: 'Factory X', index: 3 }])
    expect(result.errors).toHaveLength(0)
  })

  it('returns errors when required columns are missing', () => {
    const result = detectColumns(['Supplier A', 'Supplier B'])
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors.some(e => e.includes('reference'))).toBe(true)
  })
})

// ── parseCSVText ─────────────────────────────────────────────

describe('parseCSVText', () => {
  const csv = [
    'AWB,Total Cost,Total PCS,Supplier A,Supplier B,Supplier C,Supplier D',
    '2895949593,3698.25,11,1,3,7,0',
    '2895949594,1200.00,4,2,2,0,0',
  ].join('\n')

  it('parses valid 4-supplier CSV correctly', () => {
    const rows = parseCSVText(csv)
    expect(rows).toHaveLength(2)

    const row = rows[0]
    expect(row.reference).toBe('2895949593')
    expect(row.totalCost).toBe(3698.25)
    expect(row.totalPcs).toBe(11)
    expect(row.suppliers['Supplier A']).toBe(1)
    expect(row.suppliers['Supplier B']).toBe(3)
    expect(row.suppliers['Supplier C']).toBe(7)
    expect(row.suppliers['Supplier D']).toBe(0)
  })

  it('preserves raw string values for error display', () => {
    const rows = parseCSVText(csv)
    expect(rows[0].raw['Total Cost']).toBe('3698.25')
    expect(rows[0].raw['Total PCS']).toBe('11')
  })

  it('skips empty rows', () => {
    const withBlankLines = [
      'AWB,Total Cost,Total PCS,Supplier A',
      '111,100.00,2,2',
      '',
      '   ',
      '222,200.00,3,3',
    ].join('\n')
    const rows = parseCSVText(withBlankLines)
    expect(rows).toHaveLength(2)
  })

  it('handles Windows line endings (CRLF)', () => {
    const crlf = 'AWB,Total Cost,Total PCS,Supplier A\r\n111,100.00,2,2\r\n'
    const rows = parseCSVText(crlf)
    expect(rows).toHaveLength(1)
    expect(rows[0].reference).toBe('111')
  })

  it('handles quoted fields containing commas', () => {
    const quotedCsv = [
      'AWB,Total Cost,Total PCS,"Supplier, Inc"',
      '999,500.00,5,5',
    ].join('\n')
    const rows = parseCSVText(quotedCsv)
    expect(rows).toHaveLength(1)
    expect(rows[0].suppliers['Supplier, Inc']).toBe(5)
  })
})

// ── validateRows ─────────────────────────────────────────────

describe('validateRows', () => {
  const supplierCols = ['Supplier A', 'Supplier B', 'Supplier C', 'Supplier D']

  it('accepts valid rows', () => {
    const rows = parseCSVText([
      'AWB,Total Cost,Total PCS,Supplier A,Supplier B,Supplier C,Supplier D',
      '2895949593,3698.25,11,1,3,7,0',
    ].join('\n'))
    const { validRows, errors, isValid } = validateRows(rows, supplierCols)
    expect(isValid).toBe(true)
    expect(errors).toHaveLength(0)
    expect(validRows).toHaveLength(1)
  })

  it('returns error when PCS sum does not match Total PCS', () => {
    const rows = parseCSVText([
      'AWB,Total Cost,Total PCS,Supplier A,Supplier B',
      '111,500.00,10,2,3',   // sum=5, declared=10
    ].join('\n'))
    const { errors, isValid } = validateRows(rows, ['Supplier A', 'Supplier B'])
    expect(isValid).toBe(false)
    expect(errors.some(e => e.message.includes('does not match'))).toBe(true)
  })

  it('returns error for zero-piece rows (no supplier has pieces)', () => {
    const rows = parseCSVText([
      'AWB,Total Cost,Total PCS,Supplier A',
      '111,100.00,1,0',
    ].join('\n'))
    const { errors } = validateRows(rows, ['Supplier A'])
    expect(errors.some(e => e.field === 'suppliers')).toBe(true)
  })
})

// ── transformToShipments + rounding ──────────────────────────

describe('transformToShipments', () => {
  it('rounding: allocations sum exactly equals total cost', () => {
    const rows = parseCSVText([
      'AWB,Total Cost,Total PCS,Supplier A,Supplier B,Supplier C,Supplier D',
      '2895949593,3698.25,11,1,3,7,0',
    ].join('\n'))
    const { validRows } = validateRows(rows, ['Supplier A', 'Supplier B', 'Supplier C', 'Supplier D'])
    const shipments = transformToShipments(validRows, 'INR')

    const s = shipments[0]
    const allocationSum = s.allocations.reduce((sum, a) => sum + a.recoverableAmount, 0)
    // Round to 2dp to avoid floating-point noise in the comparison
    expect(Math.round(allocationSum * 100) / 100).toBe(s.totalCost)
  })

  it('excludes zero-piece suppliers from allocations', () => {
    const rows = parseCSVText([
      'AWB,Total Cost,Total PCS,Supplier A,Supplier B,Supplier C,Supplier D',
      '2895949593,3698.25,11,1,3,7,0',
    ].join('\n'))
    const { validRows } = validateRows(rows, ['Supplier A', 'Supplier B', 'Supplier C', 'Supplier D'])
    const shipments = transformToShipments(validRows, 'INR')

    const supplierNames = shipments[0].allocations.map(a => a.supplierName)
    expect(supplierNames).not.toContain('Supplier D')
    expect(supplierNames).toHaveLength(3)
  })

  it('computes per-piece cost correctly', () => {
    const rows = parseCSVText([
      'AWB,Total Cost,Total PCS,Supplier A',
      '111,1000.00,4,4',
    ].join('\n'))
    const { validRows } = validateRows(rows, ['Supplier A'])
    const shipments = transformToShipments(validRows, 'INR')
    expect(shipments[0].perPieceCost).toBe(250)
    expect(shipments[0].allocations[0].baseCost).toBe(1000)
  })
})

// ── getSupplierColumns ────────────────────────────────────────

describe('getSupplierColumns', () => {
  it('extracts supplier column names from CSV header', () => {
    const csv = 'AWB,Total Cost,Total PCS,Alpha Corp,Beta Ltd\n111,100,1,1,0'
    const cols = getSupplierColumns(csv)
    expect(cols).toEqual(['Alpha Corp', 'Beta Ltd'])
  })
})
