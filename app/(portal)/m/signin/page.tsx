// Signing back in without asking anyone.
//
// The invite link is how a member gets in the first time. It is not how they
// get back in ninety days later, or on a new phone, or after clearing their
// browser — and until now the only answer to all three was "message the
// organiser for another link". That is not a login, it is a favour, and it is
// why the portal felt like it did not work.
//
// The number they already gave you, plus the PIN they set on their first visit.

export const dynamic = 'force-dynamic'

export default async function PortalSignInPage({
  searchParams,
}: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams

  return (
    <div className="pt-20">
      <p className="text-[13px] font-bold uppercase tracking-wide text-center" style={{ color: 'var(--text-faint)' }}>
        My Chit
      </p>
      <h1 className="mt-2 text-2xl font-extrabold text-center" style={{ color: 'var(--text)' }}>
        Sign in
      </h1>
      <p className="mt-3 text-[13.5px] leading-relaxed text-center" style={{ color: 'var(--text-muted)' }}>
        Your phone number and the 4-digit PIN you set.
      </p>

      <form action="/m/signin/go" method="POST" className="mt-7 space-y-3">
        <input
          name="phone" type="tel" inputMode="tel" autoComplete="tel" required
          placeholder="Phone number"
          className="w-full px-4 py-3.5 rounded-2xl text-[15px] outline-none"
          style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
        />
        <input
          name="pin" type="password" inputMode="numeric" autoComplete="current-password"
          required minLength={4} maxLength={6} placeholder="PIN"
          className="w-full px-4 py-3.5 rounded-2xl text-[15px] tracking-[0.4em] outline-none"
          style={{ border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
        />
        {e && (
          <p className="text-[13px] leading-relaxed px-1" style={{ color: 'var(--expense)' }}>{e}</p>
        )}
        <button
          type="submit"
          className="w-full text-white text-[15px] font-bold py-3.5 rounded-2xl"
          style={{ background: 'var(--brand)' }}
        >
          Sign in
        </button>
      </form>

      <p className="mt-6 text-[12px] leading-relaxed text-center" style={{ color: 'var(--text-faint)' }}>
        Never set a PIN, or forgotten it? Ask the chit organiser to send you a fresh link.
        Opening it lets you set a new PIN.
      </p>
    </div>
  )
}
