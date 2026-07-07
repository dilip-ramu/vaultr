import OrganizationTabs from '@/components/organization/OrganizationTabs'

export const dynamic = 'force-dynamic'

/** Business entities live here: Companies (moved out of Setup) + Employees
 *  (moved out of Tools). Setup keeps the app-config concerns (email,
 *  categories, currencies, backup). */
export default function OrganizationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="w-full px-4 sm:px-6 lg:px-8 pt-6 pb-3 space-y-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Organization</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            The people and companies that make up your business.
          </p>
        </div>
        <OrganizationTabs />
      </div>
      <div>{children}</div>
    </div>
  )
}
