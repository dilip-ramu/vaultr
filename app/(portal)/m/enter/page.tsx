// Where the WhatsApp link lands.
//
// THIS PAGE CHANGES NOTHING. That is the entire point of it.
//
// Every messaging app fetches a link to build its preview card. When this was a
// GET route handler that redeemed the token, WhatsApp's own preview fetch spent
// the invite before the member ever tapped it — so the member tapped a link
// that was already used, saw "link not valid", and concluded the portal does
// not work. It did work. It worked once, for a robot.
//
// So the landing page only looks the invite up, greets the member by name, and
// waits. Spending the token needs a POST, which a preview bot never sends.

import { peekInvite } from '@/lib/chit/portal-auth'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function PortalEnterPage({
  searchParams,
}: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams
  if (!t) redirect('/m/closed')

  const peek = await peekInvite(t)
  if (!peek.ok) {
    redirect(`/m/closed?why=${encodeURIComponent(peek.reason)}`)
  }

  const first = (peek.memberName || '').trim().split(/\s+/)[0] || 'there'

  return (
    <div className="pt-20 text-center">
      <p className="text-[13px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
        My Chit
      </p>
      <h1 className="mt-2 text-2xl font-extrabold" style={{ color: 'var(--text)' }}>
        Hello {first}
      </h1>
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
        This link is for you only. It works once, on the phone you open it on.
        You will be asked to set a 4-digit PIN so you can come back later without a new link.
      </p>
    </div>
  )
}
