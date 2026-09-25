// Finding a member by the phone number they type in.
//
// A member signing back in has one thing they reliably know: their own number.
// They will type it any of a dozen ways — with +91, with a leading 0, with
// spaces, with a hyphen — and the number on file was typed by somebody else, in
// some other way, months earlier. So both sides are reduced to the last ten
// digits before they are compared.
//
// Pure, and tested, because the failure modes are both bad: too strict and a
// member cannot get in; too loose and a member sees somebody else's dues.

export interface LookupMember {
  id: string
  name: string
  phone: string | null
  portal_enabled?: boolean | null
  is_active?: boolean | null
}

/** The last ten digits, or null if there are not ten. */
export function phoneKey(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D+/g, '')
  if (digits.length < 10) return null
  return digits.slice(-10)
}

export type LookupResult =
  | { kind: 'found'; member: LookupMember }
  | { kind: 'none' }
  | { kind: 'ambiguous'; count: number }

/**
 * Exactly one live, portal-enabled member whose number ends the same way — or
 * nothing. Two members sharing a number is refused rather than guessed: showing
 * one person another person's chit account is the one outcome worth failing to
 * avoid.
 */
export function findMemberByPhone(members: LookupMember[], typed: string): LookupResult {
  const key = phoneKey(typed)
  if (!key) return { kind: 'none' }

  const hits = members.filter(m =>
    phoneKey(m.phone) === key
    && m.portal_enabled !== false
    && m.is_active !== false)

  if (hits.length === 1) return { kind: 'found', member: hits[0] }
  if (hits.length > 1) return { kind: 'ambiguous', count: hits.length }
  return { kind: 'none' }
}
