// The chit's own bank account, by name.
//
// Two places need to agree on this: the statement, which is built from that one
// account, and the collection screens, which default to it. When the statement
// read one account and collections quietly posted into another, the statement
// reconciled against nothing and the difference was invisible.
//
// Matched by name rather than by id because an id would have to be configured
// somewhere, and there is nowhere sensible to put it until this is a setting.
// Case and surrounding spaces are ignored, so renaming "unyra capital" to
// "Unyra Capital" does not silently break it.

export const CHIT_ACCOUNT_NAME = 'Unyra Capital'

export function isChitAccount(name: string | null | undefined): boolean {
  return String(name ?? '').trim().toLowerCase() === CHIT_ACCOUNT_NAME.toLowerCase()
}
