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
      <p className="mt-6 text-[12px] leading-relaxed" style={{ color: 'var(--text-faint)' }}>
        Login links can only be used once, and expire shortly after they are sent.
        Message the chit organiser and they will send you a fresh one.
      </p>
    </div>
  )
}
