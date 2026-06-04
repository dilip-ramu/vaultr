// ── Input validation (the "gatekeeper") ──────────────────────────────────────
// Deliberately permissive: only rejects data that is certainly wrong
// (impossible dates, negative/garbage amounts) — never legitimate old dates.
// Mirrors the DB CHECK constraints in supabase/migration_v32_validation.sql.

export const MIN_DATE = '1900-01-01'
export const MAX_DATE = '2100-12-31'
/** ₹100 crore — generous ceiling to catch fat-finger amounts like an extra digit run */
export const MAX_AMOUNT = 1_000_000_000_000

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** True when the string is a real calendar date between 1900 and 2100. */
export function isSaneDate(value: string | null | undefined): boolean {
  if (!value || !DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  // Reject impossible days (e.g. Feb 30) via round-trip
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return false
  return value >= MIN_DATE && value <= MAX_DATE
}

/** Error message for a date field, or null when fine. Pass required=false for optional fields. */
export function dateError(value: string | null | undefined, label = 'Date', required = true): string | null {
  if (!value) return required ? `${label} is required` : null
  if (!isSaneDate(value)) return `${label} "${value}" doesn't look like a real date — check the year`
  return null
}

/** Parse an amount that must be a positive (or zero) finite number within bounds.
 *  Returns { value } on success or { error } on failure. */
export function parseAmount(
  input: string | number | null | undefined,
  label = 'Amount',
  opts: { allowZero?: boolean } = {},
): { value: number; error: null } | { value: null; error: string } {
  const n = typeof input === 'number' ? input : parseFloat(input ?? '')
  if (input === null || input === undefined || input === '' || Number.isNaN(n)) {
    return { value: null, error: `${label} is required` }
  }
  if (!Number.isFinite(n)) return { value: null, error: `${label} is not a valid number` }
  if (n < 0) return { value: null, error: `${label} can't be negative` }
  if (n === 0 && !opts.allowZero) return { value: null, error: `${label} must be more than zero` }
  if (n > MAX_AMOUNT) return { value: null, error: `${label} looks too large — check for extra digits` }
  return { value: n, error: null }
}

/** Validate several fields at once; returns the first error or null. */
export function firstError(...errors: (string | null)[]): string | null {
  return errors.find(e => e !== null) ?? null
}
