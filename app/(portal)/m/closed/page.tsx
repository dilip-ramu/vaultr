export const dynamic = 'force-dynamic'

export default async function PortalClosedPage({
  searchParams,
}: { searchParams: Promise<{ why?: string }> }) {
  const { why } = await searchParams
  return (
    <div className="pt-24 text-center">
      <h1 className="text-lg font-extrabold">Link not valid</h1>
      <p className="mt-3 text-[13px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {why || 'This link is no longer valid. Ask for a new one.'}
      </p>
      <a
        href="/m/signin"
        className="inline-block mt-7 text-white text-[15px] font-bold px-6 py-3 rounded-2xl"
        style={{ background: 'var(--brand)' }}
      >
        Sign in with my PIN
      </a>

      <p className="mt-6 text-[12px] leading-relaxed" style={{ color: 'var(--text-faint)' }}>
        A login link can only be used once. If you have already set a 4-digit PIN, sign in
        above with your phone number and PIN — you do not need a new link. If you have not
        set one, message the chit organiser and they will send you a fresh link.
      </p>
    </div>
  )
}
