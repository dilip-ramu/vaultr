export const dynamic = 'force-dynamic'

/** Business entities: Companies + Employees + Contracts. The sub-nav
 *  (Companies / Employees / Contracts / Templates) is provided by the single
 *  top hub toggle (HubTabs → Organization), so no in-page tab bar here. */
export default function OrganizationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="w-full px-4 sm:px-6 lg:px-8 pt-6 pb-1">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Organization</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          The people and companies that make up your business.
        </p>
      </div>
      <div>{children}</div>
    </div>
  )
}
