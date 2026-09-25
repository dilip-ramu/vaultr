// The messages you paste into WhatsApp when you hand someone their access.
//
// Pure text builders, kept out of the components for two reasons. They are the
// last step of a security decision — these messages carry a password or a login
// link — so the wording matters and deserves to be reviewed in one place rather
// than buried in JSX. And a message that says the wrong thing (the wrong
// address, a missing instruction to change the password) fails silently: the
// person receiving it just cannot get in, and tells you days later.

export interface AdminHandover {
  name: string | null
  email: string
  password: string
  role: string
  appUrl: string
}

const ROLE_WORDS: Record<string, string> = {
  partner: 'You can run the chit — members, groups, auctions and collections.',
  collector: 'You can record payments.',
  viewer: 'You can view the chit. Nothing can be changed.',
}

/** What you send a partner with their new login. */
export function adminHandoverMessage(a: AdminHandover): string {
  const first = firstName(a.name) ?? 'there'
  const what = ROLE_WORDS[a.role] ?? ''
  return [
    `Hi ${first}, here is your login for our chit system.`,
    '',
    a.appUrl,
    '',
    `Username: ${a.email}`,
    `Password: ${a.password}`,
    '',
    what,
    '',
    'It will ask you to set your own password the first time you sign in. '
    + 'Please do that straight away, then delete this message.',
  ].filter((line, i, all) => !(line === '' && all[i - 1] === '')).join('\n')
}

/**
 * What you send a member with their portal link.
 *
 * The link no longer expires and is not single-use, so the message no longer
 * tells them to hurry. It tells them to KEEP it, which is the new instruction,
 * and explains the PIN — because the PIN is now what makes the link safe to
 * keep in a chat thread.
 */
export function memberInviteMessage(opts: { name: string | null; url: string }): string {
  const first = firstName(opts.name) ?? 'there'
  return [
    `Hi ${first}, here is your link to see your chit account — what you have paid, `
    + 'what is due, and each month\'s auction result.',
    '',
    opts.url,
    '',
    'Save this message. The link is yours for as long as you are a member, so you '
    + 'will not need a new one.',
    '',
    'The first time you open it you will set a 4-digit PIN. After that the link asks '
    + 'for your PIN, so nobody else can use it.',
  ].join('\n')
}

export function firstName(full: string | null | undefined): string | null {
  const t = (full ?? '').trim()
  if (!t) return null
  return t.split(/\s+/)[0]
}

/** "7 days", "30 minutes" — for a message, not a log. */
export function durationWords(minutes: number): string {
  if (minutes % 1440 === 0) {
    const d = minutes / 1440
    return `${d} day${d === 1 ? '' : 's'}`
  }
  if (minutes % 60 === 0) {
    const h = minutes / 60
    return `${h} hour${h === 1 ? '' : 's'}`
  }
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}
