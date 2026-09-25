// Where the member's permanent link lands.
//
// THIS PAGE CHANGES NOTHING. Every messaging app fetches a URL to build its
// preview card, so nothing that matters may happen on a GET.
//
// The link is permanent and identifies the member. It is not, by itself,
// permission to look: once they have set a PIN, this page asks for it. The only
// moment the link alone is enough is before a PIN exists, and the very next
// screen fixes that.

import { peekPortalToken } from '@/lib/chit/portal-auth'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function PortalEnterPage({
  searchParams,
}: { searchParams: Promise<{ t?: string; e?: string }> }) {
  const { t, e } = await searchParams
  if (!t) redirect('/m/closed')

  const peek = await peekPortalToken(t)
  if (!peek.ok) redirect(`/m/closed?why=${encodeURIComponent(peek.reason)}`)

  const first = (peek.memberName || '').trim().split(/\s+/)[0] || 'there'

  return (
    <div className="pt-20 text-center">
      <p className="text-[13px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
        My Chit
      </p>
      <h1 className="mt-2 text-2xl font-extrabold" style={{ color: 'var(--text)' }}>
        Hello {first}
      </h1>

      {peek.hasPin ? (
        <>
          <p className="mt-3 text-[13.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Enter your 4-digit PIN to open your chit account.
          </p>
          <form action="/m/enter/go" method="POST" className="mt-7 space-y-3 text-left">
            <input type="hidden" name="t" value={t} />
            <input
              name="pin" type="password" inputMode="numeric" autoComplete="current-password"
              required minLength={4} maxLength={6} placeholder="PIN" autoFocus
              className="w-full px-4 py-3.5 rounded-2xl text-[15px] tracking-[0.4em] text-center outline-none"
              style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
            />
            {e && <p className="text-[13px] leading-relaxed px-1" style={{ color: 'var(--expense)' }}>{e}</p>}
            <button
              type="submit"
              className="w-full text-white text-[15px] font-bold py-3.5 rounded-2xl"
              style={{ background: 'var(--brand)' }}
            >
              Open my chit account
            </button>
          </form>
          <p className="mt-5 text-[12px] leading-relaxed" style={{ color: 'var(--text-faint)' }}>
            Keep this link. It is yours for as long as you are a member — save it or
            pin the chat. Forgotten your PIN? Ask the chit organiser to reset it.
          </p>
        </>
      ) : (
        <>
          <p className="mt-3 text-[13.5px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            This opens your own chit account — what you have paid, what is still due,
            and each month&rsquo;s auction result.
          </p>
          <form action="/m/enter/go" method="POST" className="mt-8">
            <input type="hidden" name="t" value={t} />
            <button
              type="submit"
              className="w-full text-white text-[15px] font-bold py-3.5 rounded-2xl"
              style={{ background: 'var(--brand)' }}
            >
              Open my chit account
            </button>
          </form>
          <p className="mt-5 text-[12px] leading-relaxed" style={{ color: 'var(--text-faint)' }}>
            You will set a 4-digit PIN on the next screen. After that this link asks for
            the PIN, so it is safe to keep — and safe if somebody else ever sees it.
          </p>
        </>
      )}
    </div>
  )
}
