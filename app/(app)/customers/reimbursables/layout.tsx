import ReimbursablesTabs from '@/components/customers/reimbursables/ReimbursablesTabs'

export default function ReimbursablesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-3 space-y-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Reimbursables</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Expenses your customers (currently: Contrast) reimburse — and the invoices you've issued for them.
          </p>
        </div>
        <ReimbursablesTabs />
      </div>
      <div>{children}</div>
    </div>
  )
}
