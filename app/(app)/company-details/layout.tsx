import CompanyDetailsTabs from '@/components/company-details/CompanyDetailsTabs'

export default function CompanyDetailsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Company details</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          Your company's billing setup and the invoices you've issued
        </p>
      </div>
      <CompanyDetailsTabs />
      <div>{children}</div>
    </div>
  )
}
