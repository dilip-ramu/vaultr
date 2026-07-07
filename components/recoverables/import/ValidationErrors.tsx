import type { RowValidationError } from '@/lib/recoverables/types'

interface ValidationErrorsProps {
  errors: RowValidationError[]
  maxShow?: number
}

export default function ValidationErrors({ errors, maxShow = 5 }: ValidationErrorsProps) {
  if (errors.length === 0) return null

  const shown    = errors.slice(0, maxShow)
  const overflow = errors.length - maxShow

  return (
    <div
      className="rounded-xl p-4 space-y-1.5"
      style={{ backgroundColor: 'var(--status-cancelled-bg, #fef2f2)', border: '1px solid var(--status-cancelled-border, #fecaca)' }}
    >
      <p className="text-xs font-semibold mb-2" style={{ color: 'var(--expense, var(--expense))' }}>
        {errors.length} validation {errors.length === 1 ? 'error' : 'errors'} found
      </p>
      {shown.map((err, i) => (
        <p key={i} className="text-xs" style={{ color: 'var(--expense, var(--expense))' }}>
          {err.message}
        </p>
      ))}
      {overflow > 0 && (
        <p className="text-xs font-medium pt-1" style={{ color: 'var(--text-muted)' }}>
          …and {overflow} more {overflow === 1 ? 'error' : 'errors'}
        </p>
      )}
    </div>
  )
}
