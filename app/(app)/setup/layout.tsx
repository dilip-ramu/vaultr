import SetupTabs from '@/components/setup/SetupTabs'

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="w-full px-4 sm:px-6 lg:px-8 pt-6 pb-3 space-y-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Setup</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            One place for everything you configure once — companies, categories, types, currencies, reconciliation, and exports.
          </p>
        </div>
        <SetupTabs />
      </div>
      <div>{children}</div>
    </div>
  )
}
