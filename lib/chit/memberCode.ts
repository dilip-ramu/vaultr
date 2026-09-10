// Member numbers. PURE — no database, no network.
//
// A member number is what appears on paper: a passbook, a receipt, a WhatsApp
// message saying "UC00042 has paid". It is therefore editable, because the
// numbers in the ledger you already keep are the ones that matter, and the app
// should be able to match them rather than insisting on its own.
//
// It must also be unique. Two members sharing a number makes every one of those
// paper records ambiguous, and the ambiguity is only discovered when money is
// already in the wrong column. The database enforces it; these helpers make the
// app propose sensible numbers and explain a clash before it happens.

export const MEMBER_CODE_PREFIX = 'UC'
const DIGITS = 5

/** Normalised for comparison and storage: trimmed, upper-cased, spaces gone. */
export function normalizeMemberCode(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim().replace(/\s+/g, '').toUpperCase()
  return s.length ? s : null
}

/** The numeric tail of a code that follows the house pattern, else null. */
export function codeSequence(code: string | null | undefined): number | null {
  const s = normalizeMemberCode(code)
  if (!s) return null
  const m = s.match(new RegExp(`^${MEMBER_CODE_PREFIX}(\\d+)$`))
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

export function formatMemberCode(n: number): string {
  return `${MEMBER_CODE_PREFIX}${String(Math.max(1, Math.floor(n))).padStart(DIGITS, '0')}`
}

/**
 * The next number to offer. One past the highest that follows the pattern —
 * NOT "count + 1", which would re-issue a number after a member is deleted and
 * quietly collide with the paper record that still carries it.
 *
 * Codes that do not follow the pattern are ignored for numbering but still
 * occupy their own value, so a hand-typed "LEGACY-7" never blocks the sequence.
 */
export function nextMemberCode(existing: (string | null | undefined)[]): string {
  let highest = 0
  for (const c of existing) {
    const n = codeSequence(c)
    if (n != null && n > highest) highest = n
  }
  return formatMemberCode(highest + 1)
}

export interface CodeCheck {
  ok: boolean
  /** The value to store. Present when ok. */
  code?: string | null
  reason?: string
}

/**
 * Validate a code the user typed. `takenBy` maps normalised code → member id,
 * so editing a member and keeping their own code is not a clash with themself.
 */
export function checkMemberCode(
  raw: string | null | undefined,
  takenBy: Map<string, string>,
  selfId?: string | null,
): CodeCheck {
  const code = normalizeMemberCode(raw)
  if (!code) return { ok: true, code: null }        // blank is allowed
  if (code.length > 32) return { ok: false, reason: 'That member number is too long.' }
  if (!/^[A-Z0-9][A-Z0-9._/-]*$/.test(code)) {
    return { ok: false, reason: 'Use letters, numbers, and - . _ / only.' }
  }
  const owner = takenBy.get(code)
  if (owner && owner !== selfId) {
    return { ok: false, reason: `${code} already belongs to another member.` }
  }
  return { ok: true, code }
}
