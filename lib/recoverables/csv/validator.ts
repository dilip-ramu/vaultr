import type { RawCSVRow, RowValidationError } from '../types'

export function validateRows(
  rows: RawCSVRow[],
  supplierColumns: string[],
): {
  validRows: RawCSVRow[]
  errors: RowValidationError[]
  isValid: boolean
} {
  const errors: RowValidationError[] = []
  const validRows: RawCSVRow[] = []

  // Pre-pass: detect duplicate references
  const seenRefs = new Map<string, number>() // reference → first rowIndex
  for (const row of rows) {
    const ref = row.reference?.trim()
    if (!ref) continue
    if (seenRefs.has(ref)) {
      errors.push({
        rowIndex: row.rowIndex,
        reference: ref,
        field: 'reference',
        message: `Row ${row.rowIndex}: Duplicate AWB "${ref}" — already seen at row ${seenRefs.get(ref)}. Remove one of them.`,
      })
    } else {
      seenRefs.set(ref, row.rowIndex)
    }
  }
  const duplicateRefs = new Set(
    [...seenRefs.entries()]
      .filter(([ref]) => rows.filter(r => r.reference?.trim() === ref).length > 1)
      .map(([ref]) => ref)
  )

  for (const row of rows) {
    const rowErrors: RowValidationError[] = []

    // 1. Reference must be non-empty and not a duplicate
    if (!row.reference || row.reference.trim() === '') {
      rowErrors.push({
        rowIndex: row.rowIndex,
        reference: row.reference,
        field: 'reference',
        message: `Row ${row.rowIndex}: Reference is empty.`,
      })
    } else if (duplicateRefs.has(row.reference.trim())) {
      rowErrors.push({
        rowIndex: row.rowIndex,
        reference: row.reference,
        field: 'reference',
        message: `Row ${row.rowIndex}: Duplicate AWB "${row.reference}" — each reference must appear only once per import.`,
      })
    }

    // 2 & 7. Total cost must be a positive finite number
    if (!isFinite(row.totalCost) || row.totalCost <= 0) {
      rowErrors.push({
        rowIndex: row.rowIndex,
        reference: row.reference,
        field: 'totalCost',
        message: `Row ${row.rowIndex}: Total Cost (${row.raw['Total Cost'] ?? row.totalCost}) must be a positive number.`,
      })
    }

    // 3. Total PCS must be a positive integer
    if (!Number.isInteger(row.totalPcs) || row.totalPcs <= 0) {
      rowErrors.push({
        rowIndex: row.rowIndex,
        reference: row.reference,
        field: 'totalPcs',
        message: `Row ${row.rowIndex}: Total PCS (${row.totalPcs}) must be a positive integer.`,
      })
    }

    // 4. Each supplier piece count must be a non-negative integer
    for (const name of supplierColumns) {
      const val = row.suppliers[name] ?? 0
      if (!Number.isInteger(val) || val < 0) {
        rowErrors.push({
          rowIndex: row.rowIndex,
          reference: row.reference,
          field: `supplier_${name}`,
          message: `Row ${row.rowIndex}: Supplier "${name}" has invalid piece count (${val}). Must be a non-negative integer.`,
        })
      }
    }

    // 5. Sum of supplier pieces must equal totalPcs
    const supplierSum = supplierColumns.reduce((sum, name) => sum + (row.suppliers[name] ?? 0), 0)
    if (Number.isInteger(row.totalPcs) && row.totalPcs > 0 && supplierSum !== row.totalPcs) {
      const supplierList = supplierColumns.join(' + ')
      rowErrors.push({
        rowIndex: row.rowIndex,
        reference: row.reference,
        field: 'totalPcs',
        message: `Row ${row.rowIndex}: Total PCS (${row.totalPcs}) does not match sum of supplier pieces (${supplierSum}). Check ${supplierList}.`,
      })
    }

    // 6. At least one supplier must have pieces > 0
    const hasAnyPieces = supplierColumns.some(name => (row.suppliers[name] ?? 0) > 0)
    if (!hasAnyPieces) {
      rowErrors.push({
        rowIndex: row.rowIndex,
        reference: row.reference,
        field: 'suppliers',
        message: `Row ${row.rowIndex}: At least one supplier must have pieces > 0.`,
      })
    }

    if (rowErrors.length === 0) {
      validRows.push(row)
    } else {
      errors.push(...rowErrors)
    }
  }

  return { validRows, errors, isValid: errors.length === 0 }
}
