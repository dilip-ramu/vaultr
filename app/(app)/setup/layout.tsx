import SetupSideNav from '@/components/setup/SetupSideNav'

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full px-4 md:px-8 py-6">
      <div className="mb-5">
        <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>Setup</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Everything you configure once — email, categories, account types, currencies, and exports.
        </p>
      </div>
      {/* Two-pane: section list + content */}
      <div className="flex flex-col sm:flex-row gap-5 items-start">
        <SetupSideNav />
        <div className="flex-1 min-w-0 rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
