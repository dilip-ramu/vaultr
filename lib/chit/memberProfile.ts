// What a member may change about themselves, and what they may not.
//
// WHY THE LINE IS WHERE IT IS
//
// A member keeps their own record straight — a new address, a corrected
// account number, the nominee they have since married. Asking the chit
// operator to type all of that is how a register goes stale.
//
// Three things are NOT theirs to change, and the reason is the same for all
// three: they are how the operator and the app identify them.
//
//   their name          what the books and every message are addressed to
//   their phone number  their sign-in, and where their messages go
//   their member number the thing printed on receipts and quoted on calls
//
// A member who needs one of those changed asks the operator, who can see who
// they are talking to. That is not bureaucracy: a phone number changed by
// whoever is holding the phone is an account takeover.
//
// ── BANK DETAILS ARE THE SENSITIVE ONES ─────────────────────────────────────
//
// They can be changed here, because a member whose account has closed must be
// able to fix it, and asking them to wait for the operator is how a payout
// goes to a dead account. But every change is recorded with what it was
// before, so a change made days before a payout is visible rather than
// discovered afterwards. See chit_member_changes (v148).
//
// Pure. Validation only: no database, no session.

export type EditableField =
  | 'address' | 'aadhaar' | 'pan'
  | 'bank_name' | 'bank_account_name' | 'bank_account_number' | 'bank_ifsc' | 'bank_branch'

export const EDITABLE_FIELDS: readonly EditableField[] = [
  'address', 'aadhaar', 'pan',
  'bank_name', 'bank_account_name', 'bank_account_number', 'bank_ifsc', 'bank_branch',
]

/** The ones worth telling the operator about the moment they change. */
export const SENSITIVE_FIELDS: readonly EditableField[] = [
  'bank_account_number', 'bank_ifsc', 'bank_account_name',
]

export const FIELD_LABEL: Record<EditableField, string> = {
  address: 'Address',
  aadhaar: 'Aadhaar number',
  pan: 'PAN',
  bank_name: 'Bank',
  bank_account_name: 'Name on the account',
  bank_account_number: 'Account number',
  bank_ifsc: 'IFSC code',
  bank_branch: 'Branch',
}

export type ProfilePatch = Partial<Record<EditableField, string>>

const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()

/**
 * Everything wrong with what they typed, as a list.
 *
 * Empty is allowed everywhere: a member clearing a field they filled in by
 * mistake is a correction, not an error. What is rejected is something that
 * cannot be the thing it claims to be — a nine-digit Aadhaar, a PAN in the
 * wrong shape — because a wrong number stored confidently is worse than a
 * blank one.
 */
export function profileProblems(patch: ProfilePatch): { field: EditableField; message: string }[] {
  const out: { field: EditableField; message: string }[] = []
  const say = (field: EditableField, message: string) => out.push({ field, message })

  for (const [key, raw] of Object.entries(patch) as [EditableField, string][]) {
    if (!EDITABLE_FIELDS.includes(key)) {
      say(key, 'That is not something you can change here.')
      continue
    }
    const v = clean(raw)
    if (v === '') continue

    switch (key) {
      case 'aadhaar': {
        const digits = v.replace(/\D/g, '')
        if (digits.length !== 12) say(key, 'An Aadhaar number has 12 digits.')
        break
      }
      case 'pan':
        // Five letters, four digits, one letter.
        if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(v.replace(/\s/g, ''))) {
          say(key, 'A PAN looks like ABCDE1234F.')
        }
        break
      case 'bank_ifsc':
        // Four letters, a zero, then six characters.
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(v.replace(/\s/g, ''))) {
          say(key, 'An IFSC code looks like HDFC0001234.')
        }
        break
      case 'bank_account_number': {
        const digits = v.replace(/\s/g, '')
        if (!/^\d{6,20}$/.test(digits)) say(key, 'An account number is 6 to 20 digits.')
        break
      }
      case 'address':
        if (v.length > 300) say(key, 'Keep the address under 300 characters.')
        break
      default:
        if (v.length > 120) say(key, 'That is too long.')
    }
  }
  return out
}

/** What to store: trimmed, and the two codes in the case they are printed in. */
export function normalizePatch(patch: ProfilePatch): ProfilePatch {
  const out: ProfilePatch = {}
  for (const [key, raw] of Object.entries(patch) as [EditableField, string][]) {
    if (!EDITABLE_FIELDS.includes(key)) continue
    const v = clean(raw)
    out[key] = key === 'pan' || key === 'bank_ifsc' ? v.replace(/\s/g, '').toUpperCase() : v
  }
  return out
}

export interface FieldChange {
  field: EditableField
  from: string
  to: string
  sensitive: boolean
}

/**
 * What actually changed, for the record.
 *
 * Only real changes: saving a form without touching it should leave no trail,
 * or the trail becomes noise and stops being read — which is the same as not
 * having one.
 */
export function changedFields(
  before: Record<string, unknown>,
  patch: ProfilePatch,
): FieldChange[] {
  const out: FieldChange[] = []
  const cleaned = normalizePatch(patch)
  // In the order the fields are listed, not the order the form happened to
  // send them, so the sentence reads the same way every time.
  for (const key of EDITABLE_FIELDS) {
    const value = cleaned[key]
    if (value === undefined) continue
    const was = clean(before[key])
    if (was === value) continue
    out.push({ field: key, from: was, to: value, sensitive: SENSITIVE_FIELDS.includes(key) })
  }
  return out
}

/** 'Account number and IFSC code changed' — one line for the operator. */
export function changeWords(changes: readonly FieldChange[]): string {
  if (changes.length === 0) return 'Nothing changed.'
  const labels = changes.map(c => FIELD_LABEL[c.field])
  const list = labels.length === 1
    ? labels[0]
    : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
  return `${list} changed.`
}
