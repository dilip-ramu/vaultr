import type { RawCSVRow, RowValidationError } from '@/lib/recoverables/types'

interface CSVPreviewTableProps {
  rows: RawCSVRow[]
  supplierColumns: string[]
  errors: RowValidationError[]
}

export default function CSVPreviewTable({ rows, supplierColumns, errors }: CSVPreviewTableProps) {
  const shown = rows.slice(0, 20)
  const errorRows = new Set(errors.map(e => e.rowIndex))

  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: 'var(--border)' }}>
      <table className="min-w-full text-xs" style={{ backgroundColor: 'var(--surface)' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', backgroundColor: 'var(--surface-2)' }}>
            <th
              className="sticky left-0 px-3 py-2 text-left font-semibold whitespace-nowrap"
              style={{ color: 'var(--text-muted)', backgroundColor: 'var(--surface-2)' }}
            >
              Reference
            </th>
            <th className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
              Total Cost
            </th>
            <th className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
              Total PCS
            </th>
            {supplierColumns.map(col => (
              <th key={col} className="px-3 py-2 text-right font-semibold whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map(row => {
            const hasError = errorRows.has(row.rowIndex)
            return (
              <tr
                key={row.rowIndex}
                style={{
                  borderBottom: '1px solid var(--border)',
                  borderLeft: hasError ? '3px solid var(--expense, var(--expense))' : '3px solid transparent',
                }}
              >
                <td
                  className="sticky left-0 px-3 py-2 font-mono whitespace-nowrap"
                  style={{ color: 'var(--text)', backgroundColor: 'var(--surface)' }}
                >
                  {row.reference}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap" style={{ color: 'var(--text)' }}>
                  {row.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap" style={{ color: 'var(--text)' }}>
                  {row.totalPcs}
                </td>
                {supplierColumns.map(col => (
                  <td key={col} className="px-3 py-2 text-right whitespace-nowrap" style={{ color: 'var(--text)' }}>
                    {row.suppliers[col] ?? 0}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
      {rows.length > 20 && (
        <p className="text-xs text-center py-2" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
          Showing first 20 of {rows.length} rows
        </p>
      )}
    </div>
  )
}
